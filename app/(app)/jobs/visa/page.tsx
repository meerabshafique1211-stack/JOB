import { PageHeader } from '@/components/ui';
import { JobList, type JobSearch } from '@/components/job-list';

export default async function VisaJobs({ searchParams }: { searchParams: Promise<JobSearch> }) {
  const sp = await searchParams;
  return (
    <div>
      <PageHeader title="Visa Sponsorship Jobs" description="European vacancies with supporting evidence of work-visa sponsorship. Relocation assistance is tracked separately — relocation help alone is not sponsorship." />
      <JobList sp={sp} fixedCategory="visa" basePath="/jobs/visa" />
    </div>
  );
}
