class Company::PublicJobsController < Company::BaseController

  require 'will_paginate/array'
  add_breadcrumb "Home", '/', title: 'Dashboard'
  def index
    add_breadcrumb "Public Jobs", '#', title: 'Public Jobs'
    # @jobs = Job.joins("INNER JOIN experiences on jobs.industry = experiences.industry AND jobs.department = experiences.department INNER JOIN candidates on experiences.user_id = candidates.id").where("candidates.id in (?)", current_company.candidates.pluck(:id)).order("id DESC").uniq.paginate(page: params[:page], per_page: 10) || []
    @jobs = Job.all.paginate(page: params[:page], per_page: 10) || []
  end

  def job
    @job = Job.find(params[:id])
    @jobs = Job.joins("INNER JOIN experiences on jobs.industry = experiences.industry AND jobs.department = experiences.department INNER JOIN candidates on experiences.user_id = candidates.id").where("candidates.id in (?)", current_company.candidates.pluck(:id)).order("id DESC").uniq.paginate(page: params[:page], per_page: 10) || []
    respond_to do |format|
      format.js
      format.html {redirect_to company_public_jobs_path }
    end
  end

  def apply_job_candidate
    @job = Job.find(params[:id])
    @job.candidate_jobs.create(candidate_id: params[:candidate_id])
    redirect_to company_public_jobs_path
  end

  def create_batch_job
    @job = Job.find(params[:id])
    @job.update_attribute('is_bench_job', true)
    redirect_to company_public_jobs_path
  end

  def create_own_job
    @job = Job.find(params[:id])
    current_company.jobs.create(@job.attributes.except("id","created_by_id").merge!(created_by_id: current_user.id, tag_list: @job.tag_list, education_list: @job.education_list, ref_job_id: @job.id))
    redirect_to company_public_jobs_path, success: 'Job was successfully created.'
  end

  def apply
    @job = Job.find(params[:id])
    @candidate_id = params[:candidate_id]
    @job_application = @job.job_applications.new
    @job_application.job_applicant_reqs.build
    @job.custom_fields.each do |cf|
      @job_application.custom_fields.new(name: cf.name,required: cf.required)
    end
  end
end
