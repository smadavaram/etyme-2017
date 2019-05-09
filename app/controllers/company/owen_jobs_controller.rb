class Company::OwenJobsController < Company::BaseController
  require 'will_paginate/array'

  def index
    # @jobs = Job.joins("INNER JOIN experiences on jobs.industry = experiences.industry AND jobs.department = experiences.department INNER JOIN candidates on experiences.user_id = candidates.id").where("candidates.id in (?)", current_company.candidates.pluck(:id)).where(is_bench_job: true).order("id DESC").uniq.paginate(page: params[:page], per_page: 10) || []
    @jobs = Job.where(is_bench_job: true).order("id DESC").uniq.paginate(page: params[:page], per_page: 10) || []
  end

  def batch_job
    @job = Job.find(params[:id])
    @jobs = Job.joins("INNER JOIN experiences on jobs.industry = experiences.industry AND jobs.department = experiences.department INNER JOIN candidates on experiences.user_id = candidates.id").where("candidates.id in (?)", current_company.candidates.pluck(:id)).order("id DESC").uniq.paginate(page: params[:page], per_page: 10) || []
    respond_to do |format|
      format.js
      format.html {redirect_to company_owen_jobs_path}
    end
  end
end