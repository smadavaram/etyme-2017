# frozen_string_literal: true

class Candidate::JobsController < Candidate::BaseController
  # CallBacks
  before_action :set_job, only: %i[show apply]
  before_action :set_public_jobs, only: [:index]
  add_breadcrumb 'DashBoard', :candidate_candidate_dashboard_path

  # Breadcumb

  def show
    add_breadcrumb @job.title.titleize, candidate_job_path
  end

  def index
    add_breadcrumb 'public JOBS', candidate_jobs_path, options: { title: 'JOBS' }
  end

  def apply
    @job_application = @job.job_applications.new
    @job_application.job_applicant_reqs.build
    @job.custom_fields.each do |cf|
      @job_application.custom_fields.new(name: cf.name, required: cf.required)
    end
    # if current_candidate.jobs_application.where(job: @job)
    #
    # end
  end

  private

  def set_public_jobs
    @jobs = Job.is_public.active.includes(:created_by).paginate(page: params[:page], per_page: 10)
  end

  def set_job
    @job = Job.find_by_id(params[:id]) || []
  end
end
