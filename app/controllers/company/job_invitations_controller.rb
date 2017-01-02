class Company::JobInvitationsController < Company::BaseController

  before_action :find_job            , only: [:create , :update , :create_multiple]
  before_action :find_job_invitation , only: [ :update]
  before_action :set_job_invitations , only: [:index]
  before_action :find_received_job_invitations , only: [:accept , :reject]

  add_breadcrumb "JOB INVITATIONS", :job_invitations_path, options: { title: "JOBS INVITATIONS" }

  def index

  end

  def create
    @job_invitation = current_company.senssdt_job_invitations.new(job_invitation_params.merge!(job_id: @job.id , created_by_id: current_user.id ))
    respond_to do |format|
      if @job_invitation.save
        format.js{ flash.now[:success] = "Job Invitation successfully send." }
      else
        format.js{ flash.now[:errors] =  @job_invitation.errors.full_messages }
      end
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

  def create_multiple
    if params.has_key?("vendor_company")
      vendor_companies = Company.vendor.where(id: params[:vendor_company]) || []
      current_company.sent_job_invitations.create!(vendor_companies.map{ |c| job_invitation_params.merge!( created_by_id: current_user.id,invitation_type: 'vendor' ,recipient_type: 'User' ,recipient_id: c.owner_id)})
    elsif params.has_key?("temp_candidates")
      candidates = Candidate.where(id: params[:temp_candidates]) || []
      current_company.sent_job_invitations.create! candidates.map{ |candidate| job_invitation_params.merge!(created_by_id: current_user.id ,invitation_type: 'candidate',recipient_type: 'User' ,recipient_id: candidate.id)}
    end
    redirect_to :back
  end


  private

    def set_job_invitations
      @received_job_invitations      = current_company.received_job_invitations.order(created_at: :desc).includes(job: [:location , :company]).paginate(page: params[:page], per_page: 30) || []
      @sent_job_invitations          = current_company.sent_job_invitations.order(created_at: :desc).includes(job: [:location , :company]).paginate(page: params[:page], per_page: 30) || []
    end

    def find_job
      @job = current_company.jobs.find_by_id(params[:job_id]) || []
      # @job                           = Job.find_by_id(params[:job_id]) || []
    end

    def find_job_invitation
      @job_invitation                = @job.job_invitations.find_by_id(params[:id]) || []
    end

    def find_received_job_invitations
      @job_invitation                = current_company.received_job_invitations.where(id: params[:id]).first
    end

    def job_invitation_params
      params.require(:job_invitation).permit(:job_id , :message ,:response_message, :recipient_id , :email , :status , :expiry , :recipient_type,:invitation_type)
    end
end
