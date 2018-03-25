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
    @job_application = @job.job_applications.new
    @job.custom_fields.each do |cf|
      @job_application.custom_fields.new(name: cf.name,required: cf.required)
    end
    # if current_candidate.jobs_applicationhttps://www.google.com.pk/?gws_rd=ssls.where(job: @job)
    #
    # end

  end
  private

  def set_public_jobs
    @jobs = Job.is_public.active.includes(:created_by)
  end

  def set_job
    @job = Job.find_by_id(params[:id]) || []
  end
end
