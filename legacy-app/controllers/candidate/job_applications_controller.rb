# frozen_string_literal: true

class Candidate::JobApplicationsController < Candidate::BaseController
  before_action :find_job, only: %i[create accept_rate rate_negotiation]
  before_action :job_applications, only: :index
  before_action :find_job_application, only: %i[show accept_rate accept_interview interview rate_negotiation]
  add_breadcrumb 'DashBoard', :candidate_candidate_dashboard_path

  def create
    @job_application = current_candidate.job_applications.new(job_application_params.merge(job_id: @job.id, application_type: :candidate_direct))
    respond_to do |format|
      if @job_application.save
        format.html do
          flash[:success] = 'Successfully Applied.'
          redirect_back(fallback_location: candidate_job_invitations_path)
        end
        format.js { flash.now[:success] = 'Successfully Applied.' }
      else
        format.html do
          flash[:errors] = @job_application.errors.full_messages
          redirect_back(fallback_location: candidate_job_invitations_path)
        end
        format.js { flash.now[:errors] = @job_application.errors.full_messages }
      end
    end
  end

  def accept_rate
    service = CandidateApplicationService.new(current_candidate)
    result = service.accept_rate(@job_application)
    if result[:success]
      flash[:success] = result[:message]
    else
      flash[:errors] = result[:errors]
    end
    redirect_back(fallback_location: root_path)
  end

  def rate_negotiation
    service = CandidateApplicationService.new(current_candidate)
    result = service.negotiate_rate(@job_application, job_application_rate)
    if result[:success]
      flash[:success] = result[:message]
    else
      flash[:errors] = result[:errors]
    end
    redirect_back(fallback_location: root_path)
  end

  def interview
    service = CandidateApplicationService.new(current_candidate)
    result = service.schedule_interview(@job_application, interview_params, static_job_url(@job_application.job).to_s)
    respond_to do |format|
      if result[:success]
        format.html { flash[:success] = result[:message] }
      else
        format.html { flash[:errors] = result[:errors] }
      end
    end
    redirect_back fallback_location: root_path
  end

  def accept_interview
    service = CandidateApplicationService.new(current_candidate)
    result = service.accept_interview(@job_application, params[:interview_id], static_job_url(@job_application.job).to_s)
    if result[:success]
      flash[:success] = result[:message]
    else
      flash[:errors] = result[:errors]
    end
    redirect_back(fallback_location: root_path)
  end

  def index
    add_breadcrumb 'JobApplications', candidate_job_applications_path
  end

  def show
    add_breadcrumb @job_application.job.title, candidate_job_application_path
  end

  def share
    @job_application = JobApplication.where(share_key: params[:id]).first
    # render layout: 'share'
  end

  private

  def find_job_application
    @job_application = current_candidate.job_applications.find(params[:id])
  end

  def job_applications
    @job_applications = current_candidate.job_applications
  end

  def find_job
    @job = Job.active.is_public.where(id: params[:job_id]).first || []
  end

  def job_application_params
    params.require(:job_application).permit([:message, :cover_letter, :applicant_resume, :job_invitation_id, :status,
                                             custom_fields_attributes: %i[id name value]])
  end

  def interview_params
    params.require(:interview).permit(:date, :time, :location, :source)
  end

  def job_application_rate
    params.require(:job_application).permit(:rate_per_hour)
  end
end
