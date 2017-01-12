class Static::JobsController < ApplicationController

  before_action :set_jobs,only: [:index]
  before_action :find_job,only: [:show,:apply]

  def index
    session[:previous_url] = request.url
  end

  def show

  end

  def apply
    @job_application = @job.job_applications.new
    @job.custom_fields.each do |cf|
      @job_application.custom_fields.new(name: cf.name)
    end
  end

  private

  def set_jobs
    @jobs = Job.active.is_public
  end

  def find_job
    @job  = Job.active.is_public.where(id: params[:id]|| params[:job_id]).first
  end
end
