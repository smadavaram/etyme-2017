class Company::ConsultantsController < Company::BaseController

  add_breadcrumb "CONSULTANT", :consultants_path, options: { title: "CONSULTANT" }

  #CallBacks
  before_action :set_new_consultant , only: [:new]
  before_action :find_job_application , only: [:new] , if:

  def new
    add_breadcrumb "NEW", :new_consultant_path
    @roles = current_company.roles || []
  end

  def index
    @consultants = current_company.consultants.order(created_at: :desc).includes(:roles) || []
  end

  def create
    @consultant = current_company.consultants.new(create_consultant_params)
    if @consultant.valid? && @consultant.save
      flash[:success] =  "Successfull Added."
      redirect_to dashboard_path
    else
      flash[:errors] = @consultant.errors.full_messages
      return render 'new'
    end
  end

  private

  def set_new_consultant
    @consultant = current_company.consultants.new
    @consultant.build_consultant_profile
  end

  def find_job_application
    if params.has_key?(:job_application_id)
      @job_application = current_company.received_job_applications.find_by_id(params[:job_application_id])
      if @job_application.is_candidate_applicant?
        candidate = @job_application.user
        @consultant.first_name   = candidate.first_name
        @consultant.last_name    = candidate.last_name
        @consultant.email        = candidate.email
      end
    end
  end

  def consultant_params
    params.require(:consultant).permit(:first_name,
                                       :last_name ,
                                       :email ,
                                       :temp_working_hours,
                                       role_ids: [],
                                       consultant_profile_attributes:
                                           [
                                               :id,
                                               :location_id ,
                                               :designation,
                                               :joining_date ,
                                               :employment_type,
                                               :salary_type,
                                               :salary],
                                       custom_fields_attributes:
                                           [
                                               :id,
                                               :name,
                                               :value
                                           ],
                                       company_doc_ids:[]
    )
  end

  def create_consultant_params
    params_hash = consultant_params
    if params.has_key?(:job_application_id)
      @job_application = current_company.received_job_applications.find_by_id(params[:job_application_id])
      if @job_application.is_candidate_applicant?
        candidate = @job_application.user
        params_hash = params_hash.merge!(candidate_id: candidate.id , gender: candidate.gender , photo: candidate.photo , phone: candidate.phone , dob: candidate.dob , invited_by_id: current_user.id , invited_by_type: 'User')
      end
    end
    params_hash
  end
end
