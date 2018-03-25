class Static::JobApplicationsController < ApplicationController

  before_action :find_job ,only: :create

  def create
    @job_application=current_candidate.job_applications.new(job_application_params.merge(job_id:params[:job_id]))
    if @job_application.save
      flash[:success] = "Job Application Created"
    else
      flash[:errors] = @job_application.errors.full_messages
    end
    redirect_to :back
  end


  private
  def job_application_params
    params.require(:job_application).permit([ :message ,:applicant_resume, :cover_letter ,:candidate_email,:candidate_first_name,:candidate_last_name, :status, custom_fields_attributes:
        [
            :id,
            :name,
            :value
        ]])
  end
  def find_job
    @job=Job.active.is_public.where(id: params[:id]|| params[:job_id]).first
  end

end
