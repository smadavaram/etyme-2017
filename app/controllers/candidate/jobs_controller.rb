class Candidate::JobsController < Candidate::BaseController

  #CallBacks
  before_action :set_job,only: [:show, :apply]
  before_action :set_public_jobs,only: [:index]

  #Breadcumb
  add_breadcrumb "JOBS", :candidate_jobs_path, options: { title: "JOBS" }


  def show
    add_breadcrumb @job.title.titleize, :candidate_job_path
  end

  def index

  end

  def apply

  end

  private

  def set_public_jobs
    @jobs = Job.is_public.active
  end

  def set_job
    @job = Job.find_by_id(params[:id])
  end
end
