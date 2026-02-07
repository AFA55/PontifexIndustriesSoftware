import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';

// Create styles
const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 11,
    fontFamily: 'Helvetica',
  },
  header: {
    marginBottom: 20,
    borderBottom: '2 solid #EA580C',
    paddingBottom: 10,
  },
  companyName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#EA580C',
    marginBottom: 5,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1E293B',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 10,
    color: '#64748B',
    marginBottom: 20,
  },
  section: {
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#1E293B',
    marginBottom: 8,
  },
  paragraph: {
    fontSize: 10,
    lineHeight: 1.5,
    color: '#334155',
    marginBottom: 10,
    textAlign: 'justify',
  },
  jobDetails: {
    backgroundColor: '#F1F5F9',
    padding: 15,
    borderRadius: 5,
    marginBottom: 20,
  },
  detailRow: {
    flexDirection: 'row',
    marginBottom: 5,
  },
  detailLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#475569',
    width: 120,
  },
  detailValue: {
    fontSize: 10,
    color: '#1E293B',
    flex: 1,
  },
  signatureSection: {
    marginTop: 30,
    borderTop: '1 solid #CBD5E1',
    paddingTop: 20,
  },
  signatureBox: {
    marginTop: 10,
    marginBottom: 20,
  },
  signatureImage: {
    width: 200,
    height: 80,
    objectFit: 'contain',
  },
  signatureLine: {
    borderBottom: '1 solid #94A3B8',
    width: 250,
    marginBottom: 5,
  },
  signatureLabel: {
    fontSize: 9,
    color: '#64748B',
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    fontSize: 8,
    color: '#94A3B8',
    textAlign: 'center',
    borderTop: '1 solid #E2E8F0',
    paddingTop: 10,
  },
});

interface LiabilityReleasePDFProps {
  customerName: string;
  customerEmail: string;
  operatorName: string;
  signatureDataURL: string;
  jobNumber: string;
  jobAddress: string;
  signedAt: string;
}

export const LiabilityReleasePDF: React.FC<LiabilityReleasePDFProps> = ({
  customerName,
  customerEmail,
  operatorName,
  signatureDataURL,
  jobNumber,
  jobAddress,
  signedAt,
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
          <Text style={styles.title}>Liability Release & Indemnification</Text>
          <Text style={styles.subtitle}>Required before starting work</Text>
        </View>

        {/* Job Details */}
        <View style={styles.jobDetails}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Job Number:</Text>
            <Text style={styles.detailValue}>{jobNumber}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Location:</Text>
            <Text style={styles.detailValue}>{jobAddress}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Customer Name:</Text>
            <Text style={styles.detailValue}>{customerName}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Customer Email:</Text>
            <Text style={styles.detailValue}>{customerEmail}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Operator:</Text>
            <Text style={styles.detailValue}>{operatorName}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Date & Time:</Text>
            <Text style={styles.detailValue}>{formattedDate}</Text>
          </View>
        </View>

        {/* Terms and Conditions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Layout Assistance</Text>
          <Text style={styles.paragraph}>
            Pontifex Industries may provide layout assistance and marking services as a courtesy to the Customer. However, Customer acknowledges and agrees that Pontifex Industries shall not be liable for any errors, omissions, or inaccuracies in layouts or markings provided, regardless of whether such layouts were performed at Customer's request or as a courtesy. Customer is solely responsible for verifying the accuracy and suitability of any layouts prior to the commencement of cutting, coring, or demolition work. Customer agrees to indemnify and hold harmless Pontifex Industries from any claims arising from work performed based on layouts, whether provided by Pontifex Industries or third parties, including but not limited to claims for incorrect placement, dimensional errors, or damage resulting from reliance on such layouts.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Limitation of Liability</Text>
          <Text style={styles.paragraph}>
            Pontifex Industries' liability for any claim arising out of this agreement shall not exceed the total amount paid for the services rendered. We shall not be liable for any indirect, incidental, special, or consequential damages.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Indemnification</Text>
          <Text style={styles.paragraph}>
            Customer agrees to indemnify, defend, and hold harmless Pontifex Industries, its officers, employees, and agents from any claims, damages, losses, or expenses (including reasonable attorney fees) arising from: (a) Customer's breach of this agreement; (b) Customer's use of the services or work product; (c) Any third-party claims related to the work performed at Customer's premises.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Underground Utilities</Text>
          <Text style={styles.paragraph}>
            Customer warrants that all underground utilities have been properly marked and disclosed. Pontifex Industries is not liable for damage to unmarked or incorrectly marked utilities.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Site Conditions</Text>
          <Text style={styles.paragraph}>
            Customer is responsible for site safety and access. Any unforeseen site conditions that affect the scope of work may result in additional charges.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Operator Acknowledgment</Text>
          <Text style={styles.paragraph}>
            By signing below, the operator acknowledges that they have read and understand these terms and are authorized to execute this agreement on behalf of Pontifex Industries prior to commencing work.
          </Text>
        </View>

        {/* Signature Section */}
        <View style={styles.signatureSection}>
          <Text style={styles.sectionTitle}>Electronic Signature</Text>

          <View style={styles.signatureBox}>
            <Image src={signatureDataURL} style={styles.signatureImage} />
            <View style={styles.signatureLine} />
            <Text style={styles.signatureLabel}>Operator Signature: {operatorName}</Text>
          </View>

          <Text style={styles.paragraph}>
            I have read and accept all terms and conditions stated above, including the liability release and indemnification provisions. I understand that I am signing this agreement on behalf of Pontifex Industries before commencing work.
          </Text>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text>Pontifex Industries | Phone: (833) 695-4288 | Email: support@pontifexindustries.com</Text>
          <Text>This document should be reviewed by legal counsel before use. This template is provided for informational purposes and does not constitute legal advice.</Text>
        </View>
      </Page>
    </Document>
  );
};
