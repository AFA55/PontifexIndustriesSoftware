/**
 * OperatorScheduleEmail — an operator's daily/weekly schedule with a list of jobs.
 *
 * White-label: company name + colors from the recipient TENANT'S branding.
 * Contains a "View Full Schedule" CTA to the app.
 *
 * Replaces the raw inline HTML in:
 *   app/api/admin/send-schedule/route.ts
 */

import React from 'react';
import { Section, Text } from '@react-email/components';
import BrandedEmail, { EmailBrandingProps } from './components/BrandedEmail';
import CTAButton from './components/CTAButton';

export interface ScheduleJob {
  jobNumber: string;
  title: string;
  customerName: string;
  location?: string | null;
  address?: string | null;
  shopArrivalTime?: string | null;
  arrivalTime?: string | null;
  foremanName?: string | null;
  foremanPhone?: string | null;
  description?: string | null;
  equipmentNeeded?: string[];
}

export interface OperatorScheduleEmailProps {
  branding: EmailBrandingProps;
  operatorName: string;
  scheduleDateLabel: string;
  earliestShopTimeLabel?: string | null;
  jobs: ScheduleJob[];
  scheduleUrl: string;
}

export const PreviewProps: OperatorScheduleEmailProps = {
  branding: {
    companyName: 'Patriot Concrete Cutting',
    brandColor: '#dc2626',
    accentColor: '#1e3a5f',
    logoUrl: null,
  },
  operatorName: 'Mike Rivera',
  scheduleDateLabel: 'Monday, June 23, 2026',
  earliestShopTimeLabel: '6:00 AM',
  jobs: [
    {
      jobNumber: 'JOB-2026-000123',
      title: 'Burbank Garage Slab',
      customerName: 'Acme Builders',
      location: 'Burbank',
      address: '4800 Oak Grove Dr, Burbank CA',
      shopArrivalTime: '6:00 AM',
      arrivalTime: '7:30 AM',
      foremanName: 'Dan Cole',
      foremanPhone: '(818) 555-0142',
      description: 'Slab sawing for new garage foundation.',
      equipmentNeeded: ['Flat saw', 'Slurry vac', '6" blade'],
    },
  ],
  scheduleUrl: 'https://www.pontifexindustries.com/dashboard/job-schedule',
};

export default function OperatorScheduleEmail({
  branding,
  operatorName,
  scheduleDateLabel,
  earliestShopTimeLabel,
  jobs,
  scheduleUrl,
}: OperatorScheduleEmailProps) {
  const { brandColor, accentColor } = branding;
  const jobCount = jobs.length;

  return (
    <BrandedEmail
      branding={branding}
      preview={`Your schedule for ${scheduleDateLabel}`}
      subtitle={`Your Schedule · ${scheduleDateLabel}`}
    >
      <Section style={{ padding: '36px 40px 0' }}>
        <Text style={{ margin: '0 0 16px', fontSize: '16px', color: '#475569', lineHeight: '1.6' }}>
          Hi <strong style={{ color: '#0f172a' }}>{operatorName}</strong>,
        </Text>
        <Text style={{ margin: '0 0 24px', fontSize: '16px', color: '#475569', lineHeight: '1.6' }}>
          Here is your schedule for <strong>{scheduleDateLabel}</strong>. You have{' '}
          <strong>{jobCount}</strong> job{jobCount !== 1 ? 's' : ''} scheduled.
        </Text>
      </Section>

      {earliestShopTimeLabel ? (
        <Section
          style={{
            margin: '0 40px 24px',
            backgroundColor: '#dcfce7',
            border: '2px solid #22c55e',
            borderRadius: '12px',
            padding: '16px 20px',
          }}
        >
          <Text
            style={{
              margin: 0,
              color: '#166534',
              fontSize: '13px',
              fontWeight: '700',
              textTransform: 'uppercase',
              letterSpacing: '0.4px',
            }}
          >
            Be at shop by
          </Text>
          <Text style={{ margin: '4px 0 0', color: '#15803d', fontSize: '24px', fontWeight: '800' }}>
            {earliestShopTimeLabel}
          </Text>
        </Section>
      ) : null}

      <Section style={{ padding: '0 40px 0' }}>
        <Text style={{ margin: '0 0 16px', color: '#0f172a', fontSize: '18px', fontWeight: '700' }}>
          Your Jobs
        </Text>
      </Section>

      {jobs.map((job, index) => (
        <Section
          key={job.jobNumber + index}
          style={{
            margin: '0 40px 16px',
            backgroundColor: '#f8fafc',
            borderLeft: `4px solid ${accentColor || brandColor}`,
            borderRadius: '8px',
            padding: '16px 20px',
          }}
        >
          <Text style={{ margin: '0 0 4px', color: '#64748b', fontSize: '12px', fontWeight: '600' }}>
            #{index + 1} · {job.jobNumber}
          </Text>
          <Text style={{ margin: '0 0 12px', color: '#1e293b', fontSize: '17px', fontWeight: '700' }}>
            {job.title}
          </Text>

          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              <tr>
                <td style={{ width: '50%', verticalAlign: 'top', paddingBottom: '12px' }}>
                  <p style={{ margin: 0, color: '#64748b', fontSize: '12px' }}>Shop arrival</p>
                  <p style={{ margin: '2px 0 0', color: '#059669', fontWeight: '600', fontSize: '15px' }}>
                    {job.shopArrivalTime || 'Not set'}
                  </p>
                </td>
                <td style={{ width: '50%', verticalAlign: 'top', paddingBottom: '12px' }}>
                  <p style={{ margin: 0, color: '#64748b', fontSize: '12px' }}>Job site arrival</p>
                  <p
                    style={{
                      margin: '2px 0 0',
                      color: accentColor || brandColor,
                      fontWeight: '600',
                      fontSize: '15px',
                    }}
                  >
                    {job.arrivalTime || 'Not set'}
                  </p>
                </td>
              </tr>
            </tbody>
          </table>

          {job.location ? (
            <Text style={{ margin: '0 0 6px', color: '#475569', fontSize: '14px' }}>
              <strong>Location:</strong> {job.location}
            </Text>
          ) : null}
          {job.address ? (
            <Text style={{ margin: '0 0 6px', color: '#475569', fontSize: '14px' }}>
              <strong>Address:</strong> {job.address}
            </Text>
          ) : null}
          <Text style={{ margin: '0 0 6px', color: '#475569', fontSize: '14px' }}>
            <strong>Customer:</strong> {job.customerName}
          </Text>
          {job.foremanName ? (
            <Text style={{ margin: '0 0 6px', color: '#475569', fontSize: '14px' }}>
              <strong>Contact:</strong> {job.foremanName}
              {job.foremanPhone ? ` — ${job.foremanPhone}` : ''}
            </Text>
          ) : null}
          {job.description ? (
            <Section
              style={{
                margin: '12px 0 0',
                padding: '12px',
                backgroundColor: '#ffffff',
                borderRadius: '6px',
              }}
            >
              <Text style={{ margin: 0, color: '#475569', fontSize: '14px', lineHeight: '1.5' }}>
                <strong>Description:</strong> {job.description}
              </Text>
            </Section>
          ) : null}
          {job.equipmentNeeded && job.equipmentNeeded.length > 0 ? (
            <Text style={{ margin: '12px 0 0', color: '#475569', fontSize: '14px' }}>
              <strong>Equipment:</strong> {job.equipmentNeeded.join(', ')}
            </Text>
          ) : null}
        </Section>
      ))}

      <Section style={{ padding: '24px 40px 16px' }}>
        <CTAButton href={scheduleUrl} label="View Full Schedule in App" color={accentColor || brandColor} />
      </Section>

      <Section
        style={{
          margin: '0 40px 40px',
          padding: '16px 18px',
          backgroundColor: '#f8fafc',
          borderRadius: '8px',
          border: '1px solid #e2e8f0',
        }}
      >
        <Text style={{ margin: '0 0 6px', color: '#0f172a', fontSize: '13px', fontWeight: '700' }}>
          Important reminders
        </Text>
        <ul style={{ margin: 0, paddingLeft: '20px', color: '#64748b', fontSize: '14px', lineHeight: '1.7' }}>
          <li>Review your equipment checklist before leaving the shop</li>
          <li>Confirm all equipment is loaded and ready</li>
          <li>Check job site address and contact information</li>
          <li>Notify dispatch of any delays or issues</li>
        </ul>
      </Section>
    </BrandedEmail>
  );
}
