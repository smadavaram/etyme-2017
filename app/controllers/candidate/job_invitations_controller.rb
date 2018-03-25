class Candidate::JobInvitationsController < Candidate::BaseController
  before_action :set_job_invitations ,only: :index
  before_action :find_job_invitation ,only: [:reject , :show_invitation]

  def index

  end

  def show_invitation
    if(params[:status]=='accept')
      @job_application = @job_invitation.build_job_application
      @job_application.job_applicant_reqs.build
      @job_application.custom_fields.build
    end
    @state = params[:status] == 'accept' ? true : false
    @url = "candidate/job_invitations/partials/#{params[:status]}"
  end

  def reject
    @job_invitation.update_attributes(job_invitation_params)
  end
  private

  def find_job_invitation
    puts params[:job_invitation_id]
    @job_invitation = current_candidate.job_invitations.find(params[:job_invitation_id])
  end

  def set_job_invitations
    @job_invitations  = current_candidate.job_invitations.all
  end
  def job_invitation_params
    params.require(:job_invitation).permit(:job_id , :message , :response_message,:recipient_id , :email , :status , :expiry , :recipient_type,:invitation_type)
  end
end
