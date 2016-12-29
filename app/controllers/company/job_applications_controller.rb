class Company::JobApplicationsController < Company::BaseController

  #CallBacks
  before_action :find_job , only: [:create]
  before_action :find_received_job_invitation , only: [:create]
  before_action :set_job_applications , only: [:index]
  before_action :find_received_job_application , only: [:accept , :reject ,:interview,:hire, :short_list,:show]

  add_breadcrumb "JOB APPLICATIONS", :job_applications_path, options: { title: "JOBS APPLICATION" }

  def index

  end

  def create
    @job_application  = current_company.sent_job_applications.new(job_application_params.merge!(user_id: current_user.id , job_id: @job.id , job_invitation_id: @job_invitation.id))
    respond_to do |format|
      if @job_application.save
        format.js{ flash.now[:success] = "Successfully Created." }
      else
        format.js{ flash.now[:errors] =  @job_application.errors.full_messages }
      end

    end
  end

  def accept
    respond_to do |format|
      if @job_application.hired?
        @contract = @job_application.job.contracts.new
        @contract.contract_terms.new
        format.js
      else
        format.js{ flash.now[:errors] =  ["Request Not Completed."]}
      end
    end

  end

  def reject
    respond_to do |format|
      if @job_application.pending_review?
        if @job_application.rejected!
          format.js{ flash.now[:success] = "Successfully Rejected." }
        else
          format.js{ flash.now[:errors] =  @job_application.errors.full_messages }
        end
      else
        format.js{ flash.now[:errors] =  ["Request Not Completed."]}
      end

    end
  end

  def short_list
    respond_to do |format|
      if @job_application.pending_review?
        if @job_application.short_listed!
          format.js{ flash.now[:success] = "Successfully ShortListed." }
        else
          format.js{ flash.now[:errors] =  @job_application.errors.full_messages }
        end
      else
        format.js{ flash.now[:errors] =  ["Request Not Completed."]}
      end

    end
  end
  def interview
    respond_to do |format|
      if @job_application.short_listed?
        if @job_application.interviewing!
          format.js{ flash.now[:success] = "Successfully Interviewed." }
        else
          format.js{ flash.now[:errors] =  @job_application.errors.full_messages }
        end
      else
        format.js{ flash.now[:errors] =  ["Request Not Completed."]}
      end

    end
  end
  def hire
    respond_to do |format|
      if @job_application.interviewing?
        if @job_application.hired!
          format.js{ flash.now[:success] = "Successfully Hired." }
        else
          format.js{ flash.now[:errors] =  @job_application.errors.full_messages }
        end
      else
        format.js{ flash.now[:errors] =  ["Request Not Completed."]}
      end

    end
  end

  def show

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
