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
    if @job_application.update(accept_rate: true, status: :rate_confirmation)
      @conversation = @job_application.conversation
      @conversation.conversation_messages.rate_confirmation.update_all(message_type: :job_conversation) if @job_application.is_rate_accepted?
      body = current_candidate.full_name + " has accepted #{@job_application.rate_per_hour}/hr with reference to #{@job_application.job.title} job."
      current_candidate.conversation_messages.create(conversation_id: @conversation.id, body: body, message_type: :job_conversation)
      flash[:success] = 'Rate is Confirmed'
    else
      flash[:errors] = @job_application.errors.full_messages
    end
    redirect_back(fallback_location: root_path)
  end

  def rate_negotiation
    if @job_application.accept_rate
      flash[:errors] = ['You cannot change the rate once accepted by you.']
    else
      if @job_application.update(job_application_rate.merge(rate_initiator: current_candidate.full_name, accept_rate: false, accept_rate_by_company: false))
        @conversation = @job_application.conversation
        @conversation.conversation_messages.rate_confirmation.update_all(message_type: :job_conversation)
        body = current_candidate.full_name + " has Countered #{@job_application.rate_per_hour}/hr with reference to #{@job_application.job.title} job."
        current_candidate.conversation_messages.create(conversation_id: @conversation.id, body: body, message_type: :rate_confirmation)
        flash[:success] = 'Rate is set for company confirmation'
      else
        flash[:errors] = @job_application.errors.full_messages
      end
    end
    redirect_back(fallback_location: root_path)
  end

  def interview
    @interview = @job_application.interviews.find_by(id: params[:interview][:id])
    respond_to do |format|
      if @interview.update(interview_params.merge(accept: true, accepted_by_recruiter: false, accepted_by_company: false))
        @conversation = @job_application.conversation
        @conversation.conversation_messages.schedule_interview.update_all(message_type: :job_conversation)
        body = current_candidate.full_name + " has schedule an interview on #{@interview.date} at #{@interview.date} <a href='http://#{@job_application.job.created_by.company.etyme_url + static_job_url(@job_application.job).to_s}}'> with reference to the job </a>#{@job_application.job.title}."
        current_candidate.conversation_messages.create(conversation_id: @conversation.id, body: body, message_type: :schedule_interview, resource_id: @interview.id)
        format.html { flash[:success] = 'Interview details updated, pending confirmation' }
      else
        format.html { flash[:errors] = @job_application.errors.full_messages }
      end
    end
    redirect_back fallback_location: root_path
  end

  def accept_interview
    @interview = @job_application.interviews.find_by(id: params[:interview_id])
    if @interview.accept
      flash[:errors] = ['Already Accepted by you.']
    else
      if @interview.update(accept: true)
        @job_application.interviewing! if @interview.is_accepted?
        @conversation = @job_application.conversation
        @conversation.conversation_messages.schedule_interview.update_all(message_type: :job_conversation) if @interview.is_accepted?
        body = current_candidate.full_name + " has accepted the interview on #{@interview.date} at #{@interview.date} <a href='http://#{@job_application.job.created_by.company.etyme_url + static_job_url(@job_application.job).to_s}}'> with reference to the job </a>#{@job_application.job.title}."
        current_candidate.conversation_messages.create(conversation_id: @conversation.id, body: body, resource_id: @interview_id)
        flash[:success] = 'Interview is accepted by candidate'
      else
        flash[:errors] = @interview.errors.full_messages
      end
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
