class Static::JobApplicationsController < ApplicationController

  before_action :find_job ,only: :create

  def create
    JobApplication
    if params[:candidate_id].present?
      @candidate = Candidate.where(id: params[:candidate_id].split(" ").map(&:to_i))
      @candidate.each do |candidate|
        @job_application=candidate.job_applications.new(job_application_params.merge(job_id:params[:job_id]))
        @job_application.save
      end
    else
      @job_application=current_candidate.job_applications.new(job_application_params.merge(job_id:params[:job_id]))
      if @job_application.save
        flash[:success] = "Job Application Created"
      else
        flash[:errors] = @job_application.errors.full_messages
      end
    end
    if params[:is_candidate] == "true"
      job = Job.find(params[:job_id])
      job.update_attribute('is_bench_job', true)
    end
    redirect_back fallback_location: root_path
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
