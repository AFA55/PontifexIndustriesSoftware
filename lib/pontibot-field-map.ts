/**
 * PontiBot → Form Field Mapping Utility
 *
 * Maps PontiBot step IDs to form field names, and converts PontiBot's
 * data types to the dispatch form's data types for real-time sync.
 */

import type { PontiBotData } from '@/lib/pontibot-script';

// ============================================================
// Step ID → Changed Field(s) Mapping
// ============================================================

const STEP_TO_FIELDS: Record<string, string[]> = {
  // Step 1: Basic Info
  'step1-job-type': ['jobTypes'],
  'step1-job-type-more': ['jobTypes'],
  'step1-shop-description': ['shopTicketDescription'],
  'step1-difficulty': ['difficulty_rating'],
  'step1-priority': ['priority'],
  'step1-parking': ['truck_parking'],
  'step1-environment': ['work_environment'],
  'step1-cleanliness': ['site_cleanliness'],

  // Free-speech confirm steps (bulk extraction already synced the fields)
  'free-speech-confirm': [],

  // Step 2: Work Details (all map to jobTypeDetails)
  'step2-cd-intro': [],
  'step2-cd-free-speech': [],
  'step2-cd-free-speech-confirm': [],
  'step2-cd-accessibility': ['jobTypeDetails'],
  'step2-cd-locations': ['jobTypeDetails'],
  'step2-cd-locations-more': ['jobTypeDetails'],
  'step2-cd-holes-qty': ['jobTypeDetails'],
  'step2-cd-holes-diameter': ['jobTypeDetails'],
  'step2-cd-holes-depth': ['jobTypeDetails'],
  'step2-cd-holes-above5': ['jobTypeDetails'],
  'step2-cd-holes-ladder': ['jobTypeDetails'],
  'step2-cd-holes-more': ['jobTypeDetails'],

  'step2-wc-free-speech': [],
  'step2-wc-free-speech-confirm': [],
  'step2-wc-material': ['jobTypeDetails'],
  'step2-wc-material-other': ['jobTypeDetails'],
  'step2-wc-overcuts': ['jobTypeDetails'],
  'step2-wc-cut-type': ['jobTypeDetails'],
  'step2-wc-linear-feet': ['jobTypeDetails'],
  'step2-wc-linear-thickness': ['jobTypeDetails'],
  'step2-wc-opening-qty': ['jobTypeDetails'],
  'step2-wc-opening-size': ['jobTypeDetails'],
  'step2-wc-opening-length': ['jobTypeDetails'],
  'step2-wc-opening-width': ['jobTypeDetails'],
  'step2-wc-opening-thickness': ['jobTypeDetails'],
  'step2-wc-removing': ['jobTypeDetails'],
  'step2-wc-removal-equipment': ['jobTypeDetails'],
  'step2-wc-cuts-more': ['jobTypeDetails'],

  'step2-ss-free-speech': [],
  'step2-ss-free-speech-confirm': [],
  'step2-ss-material': ['jobTypeDetails'],
  'step2-ss-overcuts': ['jobTypeDetails'],
  'step2-ss-cut-type': ['jobTypeDetails'],
  'step2-ss-linear-feet': ['jobTypeDetails'],
  'step2-ss-linear-thickness': ['jobTypeDetails'],
  'step2-ss-area-qty': ['jobTypeDetails'],
  'step2-ss-area-length': ['jobTypeDetails'],
  'step2-ss-area-width': ['jobTypeDetails'],
  'step2-ss-area-thickness': ['jobTypeDetails'],
  'step2-ss-removing': ['jobTypeDetails'],
  'step2-ss-removal-equip': ['jobTypeDetails'],
  'step2-ss-cuts-more': ['jobTypeDetails'],

  'step2-hs-free-speech': [],
  'step2-hs-free-speech-confirm': [],
  'step2-hs-material': ['jobTypeDetails'],
  'step2-hs-locations': ['jobTypeDetails'],
  'step2-hs-overcuts': ['jobTypeDetails'],
  'step2-hs-cut-type': ['jobTypeDetails'],
  'step2-hs-linear-feet': ['jobTypeDetails'],
  'step2-hs-linear-depth': ['jobTypeDetails'],
  'step2-hs-area-qty': ['jobTypeDetails'],
  'step2-hs-area-length': ['jobTypeDetails'],
  'step2-hs-area-width': ['jobTypeDetails'],
  'step2-hs-area-thickness': ['jobTypeDetails'],
  'step2-hs-removing': ['jobTypeDetails'],
  'step2-hs-removal-equip': ['jobTypeDetails'],
  'step2-hs-cuts-more': ['jobTypeDetails'],

  'step2-ws-free-speech': [],
  'step2-ws-free-speech-confirm': [],
  'step2-ws-description': ['jobTypeDetails'],
  'step2-ws-cuts-more': ['jobTypeDetails'],

  'step2-dm-free-speech': [],
  'step2-dm-free-speech-confirm': [],
  'step2-dm-methods': ['jobTypeDetails'],
  'step2-dm-removal': ['jobTypeDetails'],
  'step2-dm-area-volume': ['jobTypeDetails'],
  'step2-dm-area-thickness': ['jobTypeDetails'],
  'step2-dm-area-material': ['jobTypeDetails'],
  'step2-dm-area-material-other': ['jobTypeDetails'],
  'step2-dm-areas-more': ['jobTypeDetails'],

  'step2-gpr-free-speech': [],
  'step2-gpr-free-speech-confirm': [],
  'step2-gpr-area': ['jobTypeDetails'],

  'step2-additional-comments': ['additionalInfo'],

  // Step 3: Location
  'step3-location': ['location'],
  'step3-address': ['address'],
  'step3-drive-time': ['estimatedDriveHours', 'estimatedDriveMinutes'],

  // Step 4: Schedule
  'step4-start-date': ['startDate', 'endDate'],
  'step4-multi-day': [],
  'step4-end-date': ['endDate'],
  'step4-arrival-time': ['arrivalTime'],
  'step4-shop-time': ['shopArrivalTime'],
  'step4-estimated-hours': ['estimatedHours'],

  // Step 5: Team
  'step5-operators': ['technicians'],
  'step5-operators-more': ['technicians'],
  'step5-salesman': ['salesman'],

  // Step 6: Equipment
  'step6-equipment-recs': ['equipment'],
  'step6-equipment-custom': ['equipment'],

  // Step 7: Job Info
  'step7-st-contact': ['contactOnSite'],
  'step7-st-phone': ['contactPhone'],
  'step7-title': ['title'],
  'step7-customer': ['customer'],
  'step7-customer-phone': ['customerPhone'],
  'step7-contact-site': ['contactOnSite'],
  'step7-contact-phone': ['contactPhone'],
  'step7-po': ['po'],
  'step7-company': ['companyName'],
  'step7-customer-email': ['customerEmail'],
  'step7-salesperson-email': ['salespersonEmail'],
  'step7-gc': ['jobSiteGC'],
  'step7-quote': ['jobQuote'],

  // Step 8: Documents
  'step8-documents': ['requiredDocuments'],
};

/**
 * Given a PontiBot step ID, return which form fields it potentially changed.
 */
export function getChangedFieldsForStep(stepId: string): string[] {
  return STEP_TO_FIELDS[stepId] || [];
}

// ============================================================
// PontiBotData → FormData Mapping
// ============================================================

/**
 * Convert PontiBotData fields to the dispatch form's field format.
 * Only converts the fields listed in `changedFields`.
 *
 * Key type differences handled:
 * - technicians: PontiBot {id, full_name}[] → form string[] (ids)
 * - salesman: PontiBot {id, full_name} | null → form string (full_name)
 * - jobTypeDetails: direct pass-through (same structure)
 */
export function mapPontiBotToFormData(
  pontiBotData: PontiBotData,
  changedFields: string[]
): Record<string, any> {
  const updates: Record<string, any> = {};

  for (const field of changedFields) {
    switch (field) {
      // Step 1
      case 'jobTypes':
        updates.jobTypes = [...pontiBotData.jobTypes];
        break;
      case 'difficulty_rating':
        updates.difficulty_rating = pontiBotData.difficulty_rating;
        break;
      case 'priority':
        updates.priority = pontiBotData.priority;
        break;
      case 'truck_parking':
        updates.truck_parking = pontiBotData.truck_parking;
        break;
      case 'work_environment':
        updates.work_environment = pontiBotData.work_environment;
        break;
      case 'site_cleanliness':
        updates.site_cleanliness = pontiBotData.site_cleanliness;
        break;
      case 'shopTicketDescription':
        // Fold into additionalInfo since form doesn't have this field
        if (pontiBotData.shopTicketDescription) {
          updates.additionalInfo = pontiBotData.shopTicketDescription;
        }
        break;

      // Step 2 - jobTypeDetails is a direct pass-through
      case 'jobTypeDetails':
        updates.jobTypeDetails = { ...pontiBotData.jobTypeDetails };
        break;
      case 'additionalInfo':
        updates.additionalInfo = pontiBotData.additionalInfo;
        break;

      // Step 3
      case 'location':
        updates.location = pontiBotData.location;
        break;
      case 'address':
        updates.address = pontiBotData.address;
        break;
      case 'estimatedDriveHours':
        updates.estimatedDriveHours = pontiBotData.estimatedDriveHours;
        break;
      case 'estimatedDriveMinutes':
        updates.estimatedDriveMinutes = pontiBotData.estimatedDriveMinutes;
        break;

      // Step 4
      case 'startDate':
        updates.startDate = pontiBotData.startDate;
        break;
      case 'endDate':
        updates.endDate = pontiBotData.endDate;
        break;
      case 'arrivalTime':
        updates.arrivalTime = pontiBotData.arrivalTime;
        break;
      case 'shopArrivalTime':
        updates.shopArrivalTime = pontiBotData.shopArrivalTime;
        break;
      case 'estimatedHours':
        updates.estimatedHours = pontiBotData.estimatedHours;
        break;

      // Step 5 — type conversion needed
      case 'technicians':
        updates.technicians = pontiBotData.technicians.map(t => t.id);
        break;
      case 'salesman':
        updates.salesman = pontiBotData.salesman?.full_name || '';
        break;

      // Step 6
      case 'equipment':
        updates.equipment = [...pontiBotData.equipment];
        break;

      // Step 7
      case 'title':
        updates.title = pontiBotData.title;
        break;
      case 'customer':
        updates.customer = pontiBotData.customer;
        break;
      case 'customerPhone':
        // Form doesn't have customerPhone directly, skip
        break;
      case 'contactOnSite':
        updates.contactOnSite = pontiBotData.contactOnSite;
        break;
      case 'contactPhone':
        updates.contactPhone = pontiBotData.contactPhone;
        break;
      case 'po':
        updates.po = pontiBotData.po;
        break;
      case 'companyName':
        updates.companyName = pontiBotData.companyName;
        break;
      case 'customerEmail':
        updates.customerEmail = pontiBotData.customerEmail;
        break;
      case 'salespersonEmail':
        updates.salespersonEmail = pontiBotData.salespersonEmail;
        break;
      case 'jobSiteGC':
        updates.jobSiteGC = pontiBotData.jobSiteGC;
        break;
      case 'jobQuote':
        updates.jobQuote = pontiBotData.jobQuote;
        break;

      // Step 8
      case 'requiredDocuments':
        updates.requiredDocuments = [...pontiBotData.requiredDocuments];
        break;
    }
  }

  return updates;
}

// ============================================================
// Form Step Auto-Advance
// ============================================================

/**
 * Given a list of changed field names, determine which form step
 * should be visible to show the relevant section.
 */
export function getFormStepForFields(changedFields: string[]): number | null {
  for (const f of changedFields) {
    if (['jobTypes', 'difficulty_rating', 'priority', 'truck_parking', 'work_environment', 'site_cleanliness'].includes(f)) return 1;
    if (f === 'jobTypeDetails') return 2;
    if (['location', 'address', 'estimatedDriveHours', 'estimatedDriveMinutes'].includes(f)) return 3;
    if (['startDate', 'endDate', 'arrivalTime', 'shopArrivalTime', 'estimatedHours'].includes(f)) return 4;
    if (['technicians', 'salesman'].includes(f)) return 5;
    if (f === 'equipment') return 6;
    if (['title', 'customer', 'companyName', 'customerEmail', 'salespersonEmail', 'po', 'contactOnSite', 'contactPhone', 'jobSiteGC', 'jobQuote'].includes(f)) return 7;
    if (f === 'requiredDocuments') return 8;
  }
  return null;
}
