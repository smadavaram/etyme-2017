class Company::JobInvitationsController < Company::BaseController

  before_action :find_job            , only: [:create , :update , :create_multiple , :import]
  before_action :find_job_invitation , only: [ :update]
  before_action :set_job_invitations , only: [:index]
  before_action :find_received_job_invitations , only: [:accept , :reject]
  before_action :authorize_user ,only: [:accept ,:reject]


  add_breadcrumb "JOB INVITATIONS", :job_invitations_path, options: { title: "JOBS INVITATIONS" }

  def index

  end

  def create
    @job_invitation = current_company.sent_job_invitations.new(job_invitation_params.merge!(job_id: @job.id , created_by_id: current_user.id ))
    respond_to do |format|
      if @job_invitation.save
        format.js{ flash.now[:success] = "Job Invitation successfully send." }
      else
        format.js{ flash.now[:errors] =  @job_invitation.errors.full_messages }
      end
    end
  end

  def show
    @job_invitation = current_company.find_send_or_received_invitation(params[:id]).first
    @company_job = @job_invitation.job
    if @job_invitation.pending? && !@job_invitation.is_sent?(current_company)
      @job_application = @job_invitation.build_job_application
      @job_application.custom_fields.build
    end
  end

  def update
    respond_to do |format|
      if @job_invitation.update(job_invitation_params)
        format.html { redirect_to @job_invitation, notice: "Successfully #{@job_invitation.status}." }
        format.js { flash.now[:success] = "Job Invitation successfully #{@job_invitation.status}." }
      else
        format.js{ flash.now[:errors] =   @job_invitation.errors.full_messages }
      end
    end
  end

  def accept
    @job_application = @job_invitation.build_job_application
    @job_application.custom_fields.build
    # render layout: 'company'
  end

  def reject
  end

  def authorize_user
    has_access?("manage_job_invitations")
  end

  def create_multiple
    invitation_params = job_invitation_params
    if params.has_key?("vendor_company")
      Company.vendor.where(id: params[:vendor_company]).each do |c|
        invitation_params = job_invitation_params
        current_company.sent_job_invitations.create!(invitation_params.merge!( created_by_id: current_user.id,invitation_type: 'vendor' ,recipient_type: 'User' ,recipient_id: c.owner_id))
      end
    elsif params.has_key?("temp_candidates")
      Candidate.where(id: params[:temp_candidates]).each do |c|
        invitation_params = job_invitation_params
        current_company.sent_job_invitations.create!(invitation_params.merge!( created_by_id: current_user.id,invitation_type: 'candidate',recipient_type: 'Candidate' ,recipient_id: c.id))
      end
    end
    redirect_to :back
  end

  def import
    Consultant.import(params[:consultant][:file] , current_company , current_user)
    redirect_to :back, notice: "Bulk imported."
  end

  private

    def set_job_invitations
      @rec_search                    = current_company.received_job_invitations.order(created_at: :desc).includes(:created_by ,:recipient,job: [:created_by  , :company]).search(params[:q])
      @received_job_invitations      = @rec_search.result(distinct: true).paginate(page: params[:page], per_page: 10) || []
      @sent_search                   = current_company.sent_job_invitations.order(created_at: :desc).includes(:created_by ,:recipient,job: [:created_by  , :company]).search(params[:q])
      @sent_job_invitations          = @sent_search.result(distinct: true).paginate(page: params[:page], per_page: 10) || []
    end

    def find_job
      @job = current_company.jobs.find_by_id(params[:job_id]) || []
    end

    def find_job_invitation
      @job_invitation                = @job.job_invitations.find_by_id(params[:id]) || []
    end

    def find_received_job_invitations
      @job_invitation                = current_company.received_job_invitations.where(id: params[:id]).first
    end

    def job_invitation_params
      params.require(:job_invitation).permit(:job_id , :email , :first_name , :last_name , :message ,:response_message, :recipient_id , :email , :status , :expiry , :recipient_type,:invitation_type)
    end
end
