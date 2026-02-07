import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

// Create styles
const styles = StyleSheet.create({
  page: {
    padding: 30,
    fontSize: 10,
    fontFamily: 'Helvetica',
  },
  header: {
    marginBottom: 15,
    borderBottom: '2 solid #EA580C',
    paddingBottom: 10,
  },
  companyName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#EA580C',
    marginBottom: 5,
  },
  title: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1E293B',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 9,
    color: '#64748B',
  },
  jobDetails: {
    backgroundColor: '#F1F5F9',
    padding: 12,
    borderRadius: 5,
    marginBottom: 15,
  },
  detailRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  detailLabel: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#475569',
    width: 100,
  },
  detailValue: {
    fontSize: 9,
    color: '#1E293B',
    flex: 1,
  },
  section: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#1E293B',
    marginBottom: 6,
    backgroundColor: '#F8FAFC',
    padding: 5,
  },
  paragraph: {
    fontSize: 9,
    lineHeight: 1.4,
    color: '#334155',
    marginBottom: 6,
    textAlign: 'justify',
  },
  listItem: {
    fontSize: 9,
    color: '#334155',
    marginBottom: 3,
    marginLeft: 15,
  },
  warningBox: {
    backgroundColor: '#FEF2F2',
    border: '1 solid #DC2626',
    padding: 8,
    borderRadius: 3,
    marginBottom: 10,
  },
  warningTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#991B1B',
    marginBottom: 4,
  },
  warningText: {
    fontSize: 8,
    color: '#7F1D1D',
    lineHeight: 1.3,
  },
  signatureSection: {
    marginTop: 15,
    borderTop: '1 solid #CBD5E1',
    paddingTop: 12,
  },
  signatureLine: {
    borderBottom: '1 solid #94A3B8',
    width: 200,
    marginBottom: 3,
    marginTop: 8,
  },
  signatureLabel: {
    fontSize: 8,
    color: '#64748B',
  },
  signatureText: {
    fontSize: 12,
    fontFamily: 'Times-Italic',
    color: '#1E293B',
    marginBottom: 2,
  },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 30,
    right: 30,
    fontSize: 7,
    color: '#94A3B8',
    textAlign: 'center',
    borderTop: '1 solid #E2E8F0',
    paddingTop: 8,
  },
});

interface WorkOrderAgreementPDFProps {
  jobNumber: string;
  jobDate: string;
  customerName: string;
  jobLocation: string;
  poNumber?: string;
  workDescription: string;
  scopeOfWork?: string[];
  signerName: string;
  signerTitle: string;
  signedAt: string;
  cutThroughAuthorized: boolean;
  cutThroughSignature?: string;
}

export const WorkOrderAgreementPDF: React.FC<WorkOrderAgreementPDFProps> = ({
  jobNumber,
  jobDate,
  customerName,
  jobLocation,
  poNumber,
  workDescription,
  scopeOfWork,
  signerName,
  signerTitle,
  signedAt,
  cutThroughAuthorized,
  cutThroughSignature,
}) => {
  const formattedDate = new Date(signedAt).toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.companyName}>PONTIFEX INDUSTRIES</Text>
          <Text style={styles.title}>Work Order & Service Agreement</Text>
          <Text style={styles.subtitle}>Signed before commencement of work</Text>
        </View>

        {/* Job Details */}
        <View style={styles.jobDetails}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Work Order #:</Text>
            <Text style={styles.detailValue}>{jobNumber}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Job Date:</Text>
            <Text style={styles.detailValue}>{new Date(jobDate).toLocaleDateString()}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Customer:</Text>
            <Text style={styles.detailValue}>{customerName}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Location:</Text>
            <Text style={styles.detailValue}>{jobLocation}</Text>
          </View>
          {poNumber && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>PO Number:</Text>
              <Text style={styles.detailValue}>{poNumber}</Text>
            </View>
          )}
        </View>

        {/* Scope of Work */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Scope of Work</Text>
          <Text style={styles.paragraph}>{workDescription}</Text>
          {scopeOfWork && scopeOfWork.length > 0 && (
            <View style={{ marginTop: 5 }}>
              {scopeOfWork.map((item, idx) => (
                <Text key={idx} style={styles.listItem}>• {item}</Text>
              ))}
            </View>
          )}
        </View>

        {/* Customer Responsibilities */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Customer Responsibilities</Text>
          <Text style={styles.paragraph}>Customer shall provide at Customer's expense:</Text>
          <Text style={styles.listItem}>• Safe and adequate access to work area</Text>
          <Text style={styles.listItem}>• Electrical power and water supply (if required)</Text>
          <Text style={styles.listItem}>• Adequate parking for equipment and vehicles</Text>
          <Text style={styles.listItem}>• Protection of existing property and finishes</Text>
          <Text style={styles.listItem}>• Accurate location of all utilities and obstructions</Text>
          <Text style={styles.listItem}>• Building access and security clearances</Text>
        </View>

        {/* Inherent Risks */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Inherent Risks of Concrete Cutting</Text>
          <Text style={styles.paragraph}>
            Customer acknowledges that concrete cutting operations inherently involve vibration that may affect adjacent structures, dust generation despite control measures, noise during operations, and minor cosmetic damage within 2" of cut edges.
          </Text>
        </View>

        {/* Water Damage Disclaimer */}
        <View style={styles.warningBox}>
          <Text style={styles.warningTitle}>⚠ WATER DAMAGE DISCLAIMER</Text>
          <Text style={styles.warningText}>
            Pontifex Industries assumes NO responsibility for water damage, moisture intrusion, or water-related issues resulting from wet cutting operations, including damage to flooring, walls, ceilings, electrical systems, or stored materials.
          </Text>
        </View>

        {/* GPR Limitations */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ground Penetrating Radar (GPR) Limitations</Text>
          <Text style={styles.paragraph}>
            When GPR services are performed, Pontifex DOES NOT GUARANTEE detection of:
          </Text>
          <Text style={styles.listItem}>• Post-tension cables or small diameter rebar (less than #4)</Text>
          <Text style={styles.listItem}>• Non-metallic utilities (PVC, fiber optic, etc.)</Text>
          <Text style={styles.listItem}>• Utilities in slabs-on-grade or shallow embedment</Text>
          <Text style={styles.listItem}>• De-energized or inactive electrical lines</Text>
          <Text style={styles.listItem}>• Low-voltage wiring, data cables, communication lines</Text>
          <Text style={styles.listItem}>• Obstructions in newly poured concrete (&lt;30 days)</Text>
          <Text style={styles.listItem}>• Heavily reinforced concrete (rebar spacing &lt;6")</Text>
        </View>

        {/* Layout Assistance */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Layout Assistance</Text>
          <Text style={styles.paragraph}>
            Pontifex Industries may provide layout assistance as a courtesy. However, Customer acknowledges that Pontifex shall not be liable for any errors in layouts provided. Customer is solely responsible for verifying accuracy of all layouts prior to commencement of work.
          </Text>
        </View>

        {/* Indemnification */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Indemnification</Text>
          <Text style={styles.paragraph}>
            Customer agrees to indemnify, defend, and hold harmless Pontifex Industries from any claims, damages, or expenses arising from Customer's negligence, inaccurate information, or failure to fulfill obligations under this Agreement.
          </Text>
        </View>

        {/* Cut-Through Authorization */}
        {cutThroughAuthorized && (
          <View style={styles.warningBox}>
            <Text style={styles.warningTitle}>⚠ CUT-THROUGH AUTHORIZATION</Text>
            <Text style={styles.warningText}>
              Customer has authorized Pontifex Industries to cut through, near, or around marked obstructions. Customer assumes 100% of risk and liability for all resulting damages and agrees to indemnify Pontifex Industries from all claims.
            </Text>
            <View style={{ marginTop: 8 }}>
              <Text style={styles.signatureText}>{cutThroughSignature}</Text>
              <View style={styles.signatureLine} />
              <Text style={styles.signatureLabel}>Cut-Through Authorization Signature</Text>
            </View>
          </View>
        )}

        {/* Signature Section */}
        <View style={styles.signatureSection}>
          <Text style={styles.sectionTitle}>Agreement Acceptance</Text>
          <Text style={styles.paragraph}>
            I have read, understand, and accept all terms and conditions stated above. I acknowledge receipt of the scope of work and agree to the limitations of liability described in this agreement.
          </Text>

          <View style={{ marginTop: 10 }}>
            <Text style={styles.signatureText}>{signerName}</Text>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureLabel}>Signature: {signerName}</Text>
            <Text style={styles.signatureLabel}>Title: {signerTitle}</Text>
            <Text style={styles.signatureLabel}>Date: {formattedDate}</Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text>Pontifex Industries | Phone: (833) 695-4288 | Email: support@pontifexindustries.com</Text>
          <Text style={{ marginTop: 3 }}>This agreement was electronically signed and is legally binding.</Text>
        </View>
      </Page>
    </Document>
  );
};
