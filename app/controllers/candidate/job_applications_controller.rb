
class Candidate::JobApplicationsController < Candidate::BaseController

  before_action :find_job , only: [:create]
  before_action :job_applications,only: :index

  def create
    @job_application  = current_candidate.job_applications.new(job_application_params.merge!({job_id: @job.id , application_type: :candidate_direct}))
    respond_to do |format|
      if @job_application.save
        format.js{ flash.now[:success] = "successfully created." }
      else
        format.js{ flash.now[:errors] =  @job_application.errors.full_messages }
      end
    end
  end
  def index
  end

  private
  def job_applications
    @job_applications=current_candidate.job_applications
  end
  def find_job
    @job = Job.active.is_public.where(id: params[:job_id]).first || []
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
