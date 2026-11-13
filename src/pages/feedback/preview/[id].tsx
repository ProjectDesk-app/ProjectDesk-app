import { useRouter } from 'next/router';
import Head from 'next/head';
import Layout from '@/components/Layout';
import FeedbackHub from '../index';

export default function StudentFeedbackPreview() {
  const router = useRouter();
  const id = typeof router.query.id === 'string' ? router.query.id : '';
  return <><Head><meta name="robots" content="noindex, nofollow" /></Head>{router.isReady && id ?
    <FeedbackHub key={id} previewReviewId={id} /> :
    <Layout title="Student preview"><p role="status">Loading student preview…</p></Layout>}</>;
}
