class Company::JobInvitationsController < Company::BaseController

  #CallBacks
  before_action :find_job            , only: [:create , :accept_job_invitation , :reject_job_invitation , :update]
  before_action :find_job_invitation , only: [:accept_job_invitation , :reject_job_invitation , :update]
  before_action :set_job_invitations , only: [:invitations]

  #BreadCrumbs
  add_breadcrumb "JOB INVITATIONS", :job_invitations_path, options: { title: "JOBS INVITATIONS" }

  # GET company/job_inivations
  def invitations

  end

  def index

  end

  def create
    @job_invitation = @job.job_invitations.new(job_invitation_params.merge!(created_by_id: current_user.id))
    respond_to do |format|
      if @job_invitation.save
        format.js{ flash[:success] = "Job Invitation successfully send." }
      else
        format.js{ flash[:errors] =  @job_invitation.errors.full_messages }
      end

    end
  end

  def update
    respond_to do |format|
      if @job_invitation.update(job_invitation_params)
        format.html { redirect_to @job_invitation, notice: "Successfully #{@job_invitation.status}." }
        format.js { flash[:success] = "Job Invitation successfully #{@job_invitation.status}." }
      else
        format.js{ flash[:errors] =   @job_invitation.errors.full_messages }
      end
    end
  end

  def accept_job_invitation
    @job_application = @job_invitation.build_job_application
    @job_application.custom_fields.build
  end

  def reject_job_invitation
  end


  private

    def set_job_invitations

      @job_invitations_received  = current_company.received_job_invitations.includes(job: [:location , :company]).paginate(page: params[:page], per_page: 30) || []

      @job_invitations           = current_company.job_invitations.includes(job: [:location , :company]).paginate(page: params[:page], per_page: 30) || []
    end

    def find_job
      # @job = current_company.jobs.find_by_id(params[:job_id]) || []
      @job = Job.find_by_id(params[:job_id]) || []
    end

    def find_job_invitation
      @job_invitation = @job.job_invitations.find_by_id(params[:id]) || []
    end

    def job_invitation_params
      params.require(:job_invitation).permit(:job_id , :message , :recipient_id , :email , :status , :expiry , :recipient_type)
    end


end
