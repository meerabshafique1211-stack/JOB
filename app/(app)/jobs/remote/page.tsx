import { PageHeader } from '@/components/ui';
import { JobList, type JobSearch } from '@/components/job-list';

export default async function RemoteJobs({ searchParams }: { searchParams: Promise<JobSearch> }) {
  const sp = await searchParams;
  return (
    <div>
      <PageHeader title="Remote Jobs" description="Vacancies whose location restriction or description explicitly allows working from Pakistan or worldwide. Open a vacancy to see the exact evidence." />
      <JobList sp={sp} fixedCategory="remote" basePath="/jobs/remote" />
    </div>
  );
}
