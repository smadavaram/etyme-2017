class Candidate::JobApplicationsController < Candidate::BaseController

  before_action :find_job , only: [:create, :accept_rate, :rate_negotiation]
  before_action :job_applications,only: :index
  before_action :find_job_application,only: [:show, :accept_rate,:rate_negotiation]

  add_breadcrumb "JobApplications", :candidate_job_applications_path

  def create
    @job_application  = current_candidate.job_applications.new(job_application_params.merge!({job_id: @job.id , application_type: :candidate_direct}))
    respond_to do |format|
      if @job_application.save
        format.js{ flash.now[:success] = "Successfully Applied." }
      else
        format.js{ flash.now[:errors] =  @job_application.errors.full_messages }
      end
    end
  end

  def accept_rate
    if @job_application.rate_confirmation!
      @conversation = @job_application.conversations.find_by(id: params[:conversation_id])
      body = current_candidate.full_name + " has accepted #{@job_application.rate_per_hour}/hr with reference to #{@job_application.job.title} job."
      current_candidate.conversation_messages.create(conversation_id: @conversation.id, body: body, message_type: :rate_confirmation)
      flash[:success] = "Rate is Confirmed"
    else
      flash[:errors] = @job_application.errors.full_messages
    end
    redirect_back(fallback_location: root_path)
  end

  def rate_negotiation
    if @job_application.update(job_application_rate.merge(rate_initiator: current_candidate.full_name))
      @conversation = @job_application.conversations.find_by(id: params[:conversation_id])
      body = current_candidate.full_name + " has Countered #{@job_application.rate_per_hour}/hr with reference to #{@job_application.job.title} job.
              <a href='http://#{@job_application.job.created_by.company.etyme_url + accept_rate_job_application_path(@job_application,@conversation)}' data-method='post'>
              Click Here </a> to Accept or <a href='' data-toggle='modal' data-target='#candidate-rate-confirmation-#{@job_application.applicationable_id}' >Click Here</a> to Counter".html_safe
      current_candidate.conversation_messages.create(conversation_id: @conversation.id, body: body, message_type: :rate_confirmation)
      flash[:success] = "Rate is set for company confirmation"
    else
      flash[:errors] = @job_application.errors.full_messages
    end
    redirect_back(fallback_location: root_path)
  end

  def index
  end

  def show
    add_breadcrumb @job_application.job.title, :candidate_job_application_path
  end

  def share
    @job_application = JobApplication.where(share_key: params[:id]).first
    # render layout: 'share'
  end

  private

  def find_job_application
    @job_application=current_candidate.job_applications.find(params[:id])
  end

  def job_applications
    @job_applications = current_candidate.job_applications
  end
  def find_job
    @job = Job.active.is_public.where(id: params[:job_id]).first || []
  end

  def job_application_params
    params.require(:job_application).permit([ :message , :cover_letter ,:applicant_resume,:job_invitation_id ,:status, custom_fields_attributes:
                                                           [
                                                               :id,
                                                               :name,
                                                               :value

                                                           ]])
  end
  def job_application_rate
    params.require(:job_application).permit(:rate_per_hour)
  end
end
