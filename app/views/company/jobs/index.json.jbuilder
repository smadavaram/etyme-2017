# json.array! @company_jobs, partial: 'jobs/_job', as: :company_job


json.jobs @company_jobs do |job|
  json.title "job.title"
end