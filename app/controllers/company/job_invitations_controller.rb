class Company::JobInvitationsController < Company::BaseController

  #CallBacks
  before_action :set_job , only: [:create]

  # GET company/job_inivations
  def invitations
    add_breadcrumb "JOB INVITATIONS", :new_job_path, options: { title: "JOBS INVITATIONS" }
  end

  def create
    @job_invitation = @job.job_invitations.new(job_invitation_params.merge!(created_by_id: current_user.id))
    respond_to do |format|
      if @job_invitation.save
        format.js{ flash[:success] = "Job Invitation successfully send." }
      else
        format.js{ flash[:errors] =  @job_invitation.errors }
      end

    end
  end

  private

    def set_job
      @job = current_company.jobs.find_by_id(params[:job_id]) || []
    end

    def job_invitation_params
      params.require(:job_invitation).permit(:job_id , :description , :recipient_id , :email , :status , :expiry , :recipient_type)
    end


end
