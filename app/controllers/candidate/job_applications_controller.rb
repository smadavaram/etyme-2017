class Candidate::JobApplicationsController < Candidate::BaseController

  before_action :find_job , only: [:create]

  def create
    @job_application  = current_candidate.job_applications.new(job_application_params.merge!(job_id: @job.id))
    respond_to do |format|
      if @job_application.save
        format.js{ flash[:success] = "successfully Accepted." }
      else
        format.js{ flash[:errors] =  @job_application.errors.full_messages }
      end
    end
  end

  private
  def find_job
    @job = Job.find_by_id(params[:job_id]) || []
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
