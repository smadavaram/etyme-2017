class Company::JobApplicationsController < Company::BaseController

  #CallBacks
  before_action :find_job , only: [:create]
  before_action :find_received_job_invitation , only: [:create]
  before_action :set_job_applications , only: [:index]
  before_action :find_received_job_application , only: [:accept_job_application , :reject_job_application , :short_list_job_application]

  # BreadCrumbs
  add_breadcrumb "JOB APPLICATION", :job_applications_path, options: { title: "JOBS APPLICATION" }

  # company/job_applications
  def index

  end

  def create
    @job_application  = current_company.sent_job_applications.new(job_application_params.merge!(user_id: current_user.id , job_id: @job.id , job_invitation_id: @job_invitation.id))
    respond_to do |format|
      if @job_application.save
        format.js{ flash[:success] = "successfully Accepted." }
      else
        format.js{ flash[:errors] =  @job_application.errors.full_messages }
      end

    end
  end

  # POST company/jobs/:job_id/job_invitations/:job_invitation_id/job_applications/:id/accept_job_application
  def accept_job_application
    respond_to do |format|
      if @job_application.pending?
        @contract = @job_application.job.contracts.new
        @contract.contract_terms.new
        format.js
      else
        format.js{ flash[:errors] =  ["Request Not Completed."]}
      end
    end

  end

  # POST company/jobs/:job_id/job_invitations/:job_invitation_id/job_applications/:id/reject_job_application
  def reject_job_application
    respond_to do |format|
      if @job_application.pending?
        if @job_application.rejected!
          format.js{ flash[:success] = "successfully Rejected." }
        else
          format.js{ flash[:errors] =  @job_application.errors.full_messages }
        end
      else
        format.js{ flash[:errors] =  ["Request Not Completed."]}
      end

    end
  end

  # POST company/jobs/:job_id/job_invitations/:job_invitation_id/job_applications/:id/short_list_job_application
  def short_list_job_application
    respond_to do |format|
      if @job_application.pending?
        if @job_application.short_listed!
          format.js{ flash[:success] = "successfully ShortListed." }
        else
          format.js{ flash[:errors] =  @job_application.errors.full_messages }
        end
      else
        format.js{ flash[:errors] =  ["Request Not Completed."]}
      end

    end
  end

  private

  def set_job_applications
    @received_job_applications = current_company.received_job_applications || []
    @sent_job_applications     = current_company.sent_job_applications     || []
  end

  def find_job
    # @job = current_company.jobs.find_by_id(params[:job_id]) || []
    @job = Job.active.where(id: params[:job_id]).first || []
  end

  def find_job_invitation
    @job_invitation = @job.job_invitations.find_by_id(params[:job_invitation_id]) || []
  end

  def find_received_job_invitation
    @job_invitation = current_company.received_job_invitations.where(id: params[:job_invitation_id]).first || []
  end

  def find_received_job_application
    @job_application = current_company.received_job_applications.where(id: params[:id]).first || []
  end

  def job_application_params
    params.require(:job_application).permit([ :message , :cover_letter , :status, custom_fields_attributes:
                                                        [
                                                            :id,
                                                            :name,
                                                            :value
                                                        ]])
  end


end
