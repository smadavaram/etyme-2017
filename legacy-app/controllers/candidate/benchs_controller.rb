# frozen_string_literal: true

class Candidate::BenchsController < Candidate::BaseController
  require 'will_paginate/array'

  def index
    @candidates = CandidatesCompany.where(candidate_id: current_candidate.id).paginate(page: params[:page], per_page: 8)

    # @jobs = Job.where(industry: current_candidate.industry_name, department: current_candidate.dept_name).order("id DESC").uniq.paginate(page: params[:page], per_page: 10) || []
  end

  def job
    @job = Job.find(params[:id])
    @jobs = Job.where(industry: current_candidate.industry_name, department: current_candidate.dept_name).order('id DESC').uniq.paginate(page: params[:page], per_page: 10) || []
    respond_to do |format|
      format.js
      format.html { redirect_to company_public_jobs_path }
    end
  end

  def candidate_bench_job
    @jobs = Job.where(industry: current_candidate.industry_name, department: current_candidate.dept_name).where(is_bench_job: true).order('id DESC').uniq.paginate(page: params[:page], per_page: 10) || []
  end

  def batch_job
    @job = Job.find(params[:id])
    @jobs = Job.where(industry: current_candidate.industry_name, department: current_candidate.dept_name).where(is_bench_job: true).order('id DESC').uniq.paginate(page: params[:page], per_page: 10) || []
    respond_to do |format|
      format.js
      format.html { redirect_to company_owen_jobs_path }
    end
  end

  def apply
    @job = Job.find(params[:id])
    @candidate_id = params[:candidate_id]
    @job_application = @job.job_applications.new
    @job_application.job_applicant_reqs.build
    @job.custom_fields.each do |cf|
      @job_application.custom_fields.new(name: cf.name, required: cf.required)
    end
  end

  def candidate_company_info
    @company = JobApplication.where(applicationable_id: current_candidate.id).paginate(page: params[:page], per_page: 10) || []
  end

  def accept_bench
    @candidate = CandidatesCompany.where(candidate_id: params[:candidate_id], company_id: params[:id])
    CandidatesCompany.where(candidate_id: params[:candidate_id]).update_all(candidate_status: 'pending')
    @candidate.update_all(candidate_status: 1)
    redirect_to benchs_path
  end
end
