class Static::JobsController < ApplicationController

  before_action :set_jobs,only: [:index]
  before_action :find_job,only: [:show,:apply]

  layout 'static'
  add_breadcrumb "Home",'/'
  add_breadcrumb "Jobs",:static_jobs_path
  def index
    session[:previous_url] = request.url
    params[:category].present? ? (add_breadcrumb params[:category].titleize,:static_jobs_path) : ""
  end

  def show
    add_breadcrumb @job.title, static_job_path
  end

  def apply
    @job_application = @job.job_applications.new
    @job.custom_fields.each do |cf|
      @job_application.custom_fields.new(name: cf.name)
    end
  end

  private

  def set_jobs
    @search = params[:category].present? ? Job.active.is_public.where('job_category =?',params[:category]).search(params[:q]): Job.active.is_public.search(params[:q])
    @jobs = @search.result(distinct: true).paginate(:page => params[:page], :per_page => 4)
    @search_q = Job.is_public.active.search(params[:q])
    @jobs_groups = @search_q.result.group_by(&:job_category)
  end

  def find_job
    @job  = Job.active.is_public.where(id: params[:id]|| params[:job_id]).first
  end
end
