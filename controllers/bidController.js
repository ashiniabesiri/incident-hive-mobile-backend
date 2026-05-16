
const Joi = require('joi');

const IncidentModel      = require('../models/Incident');
const BidModel           = require('../models/Bid');
const UserModel          = require('../models/User');
const ExpertProfileModel = require('../models/ExpertProfile');
const {
  notifyNewBid,
  notifyBidAccepted,
  notifyBidDeclined,
  notifyMultipleExpertsDeclined,
  notifyIncidentCompleted,
} = require('../services/notificationService');
const logger = require('../utils/logger');

// Validation schemas

const placeBidSchema = Joi.object({
  proposed_approach: Joi.string().min(20).max(5000).trim().required().messages({
    'string.min':   'Proposed approach must be at least 20 characters.',
    'string.max':   'Proposed approach must not exceed 5000 characters.',
    'any.required': 'Proposed approach is required.',
  }),
  estimated_time: Joi.alternatives().try(
    Joi.number().integer().min(1).max(10000),
    Joi.string().trim().pattern(/^\d+\s*(hours?|hrs?|h)$/i)
  ).optional(),
  estimated_hours: Joi.number().integer().min(1).max(10000).optional().messages({
    'number.base':    'Estimated hours must be a number.',
    'number.integer': 'Estimated hours must be a whole number.',
    'number.min':     'Estimated hours must be at least 1.',
  }),
  proposed_fee: Joi.number().precision(2).min(0).required().messages({
    'number.base':  'Proposed fee must be a number.',
    'number.min':   'Proposed fee cannot be negative.',
    'any.required': 'Proposed fee is required.',
  }),
}).or('estimated_time', 'estimated_hours').messages({
  'object.missing': 'Either estimated_time or estimated_hours is required.',
});

function parseEstimatedHours(body) {
  if (body.estimated_hours != null) return body.estimated_hours;
  const val = body.estimated_time;
  if (typeof val === 'number') return val;
  const match = String(val).match(/^(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

function formatEstimatedTime(hours) {
  return `${hours} hour${hours === 1 ? '' : 's'}`;
}

// Shared helpers

function validateBody(schema, body, res) {
  const { error, value } = schema.validate(body, {
    abortEarly: false,
    stripUnknown: true,
  });
  if (error) {
    res.status(400).json({
      success: false,
      message: 'Validation failed.',
      errors:  error.details.map((d) => d.message.replace(/['"]/g, '')),
    });
    return null;
  }
  return value;
}

async function assertIncidentOwnership(incidentId, reporterId, res) {
  const incident = await IncidentModel.findById(incidentId);
  if (!incident || incident.reporter_id !== reporterId) {
    res.status(404).json({ success: false, message: 'Incident not found.' });
    return null;
  }
  return incident;
}

function stripExpertPii(bid) {
  const { expert_email, expert_phone, ...rest } = bid;

  const expert_name = [rest.expert_first_name, rest.expert_last_name]
    .filter(Boolean)
    .join(' ')
    .trim();

  return {
    ...rest,
    expert_name,
    expert_areas: rest.expert_expertise_areas || [],
  };
}

// GET /api/incidents/:incident_id/bids

async function listBids(req, res, next) {
  try {
    const { incident_id } = req.params;
    const reporterId      = req.user.userId;

    // Ownership: reporter can only see bids on their own incidents
    const incident = await assertIncidentOwnership(incident_id, reporterId, res);
    if (!incident) return;

    const page   = Math.max(1, parseInt(req.query.page  || '1',  10));
    const limit  = Math.min(50, Math.max(1, parseInt(req.query.limit || '20', 10)));
    const offset = (page - 1) * limit;

    const [bids, total] = await Promise.all([
      BidModel.findByIncident(incident_id, { limit, offset }),
      BidModel.countByIncident(incident_id),
    ]);

    const safeBids = bids.map(stripExpertPii);

    res.status(200).json({
      success: true,
      data: {
        bids: safeBids,
        pagination: {
          total,
          page,
          limit,
          total_pages: Math.ceil(total / limit),
          has_next_page: page < Math.ceil(total / limit),
          has_prev_page: page > 1,
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

// POST /api/incidents/:incident_id/bids

async function placeBid(req, res, next) {
  try {
    const { incident_id } = req.params;
    const expertId        = req.user.userId;

    // Validate body
    const body = validateBody(placeBidSchema, req.body, res);
    if (!body) return;

    const incident = await IncidentModel.findById(incident_id);
    if (!incident) {
      return res.status(404).json({ success: false, message: 'Incident not found.' });
    }

    // Guard: incident must be Open
    if (incident.status !== 'Open') {
      return res.status(409).json({
        success: false,
        message: `Bids can only be placed on Open incidents. This incident is '${incident.status}'.`,
      });
    }

    if (new Date() > new Date(incident.bid_window_ends_at)) {
      return res.status(409).json({
        success: false,
        message: 'The bidding window for this incident has expired.',
        bidWindowEndedAt: incident.bid_window_ends_at,
      });
    }

    const existingBid = await BidModel.findByExpertAndIncident(expertId, incident_id);
    if (existingBid) {
      return res.status(409).json({
        success: false,
        message: 'You have already placed a bid on this incident.',
        existingBidId: existingBid.bid_id,
      });
    }

    // Normalise estimated_time / estimated_hours
    const estimatedHours = parseEstimatedHours(body);

    // Create the bid
    const bid = await BidModel.create({
      incidentId:       incident_id,
      expertId,
      proposedApproach: body.proposed_approach,
      estimatedHours,
      proposedFee:      body.proposed_fee,
    });

    // Notify the reporter (fire-and-forget)
    const expert = await UserModel.findById(expertId);
    notifyNewBid(incident.reporter_id, {
      incidentId:    incident_id,
      incidentTitle: incident.title,
      expertName:    `${expert.first_name} ${expert.last_name}`,
      proposedFee:   body.proposed_fee.toFixed(2),
    }).catch((err) => logger.error('notifyNewBid failed:', err));

    res.status(201).json({
      success: true,
      message: 'Bid placed successfully.',
      data: {
        bid: {
          ...bid,
          estimated_time: formatEstimatedTime(bid.estimated_hours),
        },
      },
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        message: 'You have already placed a bid on this incident.',
      });
    }
    next(error);
  }
}

// POST /api/incidents/:incident_id/bids/:bid_id/accept

async function acceptBid(req, res, next) {
  try {
    const { incident_id, bid_id } = req.params;
    const reporterId              = req.user.userId;

    // Ownership check
    const incident = await assertIncidentOwnership(incident_id, reporterId, res);
    if (!incident) return;

    if (incident.status !== 'Open') {
      return res.status(409).json({
        success: false,
        message: `Bids can only be accepted on Open incidents. Current status: '${incident.status}'.`,
      });
    }

    const bid = await BidModel.findById(bid_id);
    if (!bid || bid.incident_id !== incident_id) {
      return res.status(404).json({ success: false, message: 'Bid not found.' });
    }

    if (bid.status !== 'Pending') {
      return res.status(409).json({
        success: false,
        message: `Only Pending bids can be accepted. This bid is '${bid.status}'.`,
      });
    }

    const allBids          = await BidModel.findByIncident(incident_id);
    const toDecline        = allBids.filter(
      (b) => b.bid_id !== bid_id && b.status === 'Pending'
    );
    const declinedBidIds   = toDecline.map((b) => b.bid_id);
    const declinedExpertIds = toDecline.map((b) => b.expert_id);

    await BidModel.updateStatus(bid_id, 'Accepted', incident_id);

    // Advance incident to In Progress
    await IncidentModel.updateStatus(incident_id, 'In Progress');

    const expert        = await UserModel.findById(bid.expert_id);
    const expertProfile = await ExpertProfileModel.findById(bid.expert_id);

    // Fetch reporter details for notification copy
    const reporter = await UserModel.findById(reporterId);

    // Fire notifications (all fire-and-forget)
    notifyBidAccepted(bid.expert_id, {
      incidentId:    incident_id,
      incidentTitle: incident.title,
      reporterName:  `${reporter.first_name} ${reporter.last_name}`,
      reporterEmail: reporter.email,
      reporterPhone: reporter.phone_number,
    }).catch((err) => logger.error('notifyBidAccepted failed:', err));

    if (declinedExpertIds.length > 0) {
      notifyMultipleExpertsDeclined(declinedExpertIds, {
        incidentId:    incident_id,
        incidentTitle: incident.title,
      }).catch((err) => logger.error('notifyMultipleExpertsDeclined failed:', err));
    }

    res.status(200).json({
      success: true,
      message: 'Bid accepted. The engagement is now in progress.',
      data: {
        bid_id:          bid_id,
        incident_status: 'In Progress',
        declined_bid_ids: declinedBidIds,
        expert_contact: {
          expert_id:   expert.user_id,
          first_name:  expert.first_name,
          last_name:   expert.last_name,
          email:       expert.email,          // PII revealed here
          phone_number: expert.phone_number,  // PII revealed here
          credentials:          expertProfile?.credentials        || null,
          expertise_areas:      expertProfile?.expertise_areas    || [],
          completed_engagements: expertProfile?.completed_engagements || 0,
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

// POST /api/incidents/:incident_id/bids/:bid_id/decline

async function declineBid(req, res, next) {
  try {
    const { incident_id, bid_id } = req.params;
    const reporterId              = req.user.userId;

    // Ownership check
    const incident = await assertIncidentOwnership(incident_id, reporterId, res);
    if (!incident) return;

    // Fetch the bid
    const bid = await BidModel.findById(bid_id);
    if (!bid || bid.incident_id !== incident_id) {
      return res.status(404).json({ success: false, message: 'Bid not found.' });
    }

    if (bid.status !== 'Pending') {
      return res.status(409).json({
        success: false,
        message: `Only Pending bids can be declined. This bid is '${bid.status}'.`,
      });
    }

    // Decline the bid
    const updated = await BidModel.updateStatus(bid_id, 'Declined');

    // Notify the expert (fire-and-forget)
    notifyBidDeclined(bid.expert_id, {
      incidentId:    incident_id,
      incidentTitle: incident.title,
      wasAutoDeclined: false,
    }).catch((err) => logger.error('notifyBidDeclined failed:', err));

    res.status(200).json({
      success: true,
      message: 'Bid declined.',
      data:    { bid: updated },
    });
  } catch (error) {
    next(error);
  }
}

// POST /api/incidents/:incident_id/complete

async function completeEngagement(req, res, next) {
  try {
    const { incident_id } = req.params;
    const expertId        = req.user.userId;

    // Fetch incident
    const incident = await IncidentModel.findById(incident_id);
    if (!incident) {
      return res.status(404).json({ success: false, message: 'Incident not found.' });
    }

    if (incident.status !== 'In Progress') {
      return res.status(409).json({
        success: false,
        message: `Only In Progress incidents can be marked complete. Current status: '${incident.status}'.`,
      });
    }

    const allBids    = await BidModel.findByIncident(incident_id, { limit: 100 });
    const acceptedBid = allBids.find(
      (b) => b.status === 'Accepted' && b.expert_id === expertId
    );

    if (!acceptedBid) {
      return res.status(403).json({
        success: false,
        message: 'You are not the assigned expert for this incident.',
      });
    }

    // Mark incident as Completed
    const updatedIncident = await IncidentModel.updateStatus(incident_id, 'Completed');

    // Update expert's profile stats
    const updatedProfile = await ExpertProfileModel.incrementEngagements(
      expertId,
      parseFloat(acceptedBid.proposed_fee)
    );

    // Notify the reporter (fire-and-forget)
    const expert = await UserModel.findById(expertId);
    notifyIncidentCompleted(incident.reporter_id, {
      incidentId:    incident_id,
      incidentTitle: incident.title,
      expertName:    `${expert.first_name} ${expert.last_name}`,
    }).catch((err) => logger.error('notifyIncidentCompleted failed:', err));

    res.status(200).json({
      success: true,
      message: 'Engagement marked as complete.',
      data: {
        incident: updatedIncident,
        expert_stats: {
          completed_engagements: updatedProfile?.completed_engagements,
          total_earned:          updatedProfile?.total_earned,
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listBids,
  placeBid,
  acceptBid,
  declineBid,
  completeEngagement,
};
