class Company::JobInvitationsController < Company::BaseController

  #CallBacks
  before_action :find_job , only: [:create , :accept_job_invitation , :reject_job_invitation , :update]
  before_action :find_job_invitation , only: [:accept_job_invitation , :reject_job_invitation , :update]
  before_action :set_job_invitations , only: [:invitations]

  # GET company/job_inivations
  def invitations
    add_breadcrumb "JOB INVITATIONS", :job_invitations_path, options: { title: "JOBS INVITATIONS" }
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
      if @job_invitation.update(job_invitation_params.merge!(status: 1))
        format.html { redirect_to @job_invitation, notice: 'Successfully Accepted.' }
        format.js { flash[:success] = "Job Invitation successfully Accepted." }
      else
        format.js{ flash[:errors] =   @job_invitation.errors.full_messages }
      end
    end
  end

  def accept_job_invitation
  end

  def reject_job_invitation
    respond_to do |format|
      if @job_invitation.update_column(:status , 2)
        format.js{ flash[:success] = "Successfully Rejected" }
      else
        format.js{ flash[:errors] =  @job_invitation.errors }
      end

    end
  end


  private

    def set_job_invitations
      @job_invitations = current_user.job_invitations.includes(job: [:location , :company]) || []
    end

    def find_job
      @job = current_company.jobs.find_by_id(params[:job_id]) || []
    end

    def find_job_invitation
      @job_invitation = @job.job_invitations.find_by_id(params[:id]) || []
    end



    def job_invitation_params
      params.require(:job_invitation).permit([:job_id , :description , :recipient_id , :email , :status , :expiry , :recipient_type, custom_fields_attributes:
          [
              :id,
              :name,
              :value
          ]])
    end


end
