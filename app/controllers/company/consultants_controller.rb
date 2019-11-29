class Company::ConsultantsController < Company::BaseController

  add_breadcrumb "CONSULTANTs".humanize, :consultants_path, options: { title: "CONSULTANT" }
  before_action :authorized_user ,only:  [:new , :show, :update]

  #CallBacks
  before_action :set_new_consultant , only: [:new]
  before_action :find_job_application , only: [:new]
  before_action :find_consulant       , only: [:edit,:update,:destroy]

  def new
    add_breadcrumb "NEW", new_consultant_path
    @roles = current_company.roles || []
  end

  def index
    @search      = current_company.consultants.search(params[:q])
    @consultants = @search.result.order(created_at: :desc).includes(:roles)
  end

  def create
    @consultant = current_company.consultants.new(create_consultant_params.merge( invited_by_id: current_user.id , invited_by_type: 'User'))
    if @consultant.save
      @consultant.create_activity :create, owner:current_company,recipient: current_company
      flash[:success] =  "Successfull Added."
      redirect_to consultants_path
    else
      flash[:errors] = @consultant.errors.full_messages
      return render 'new'
    end
  end

  def edit

  end

  def update

    if @consultant.update(consultant_params)
      if params[:consultant][:resend_invitation]
        @consultant.invite! { |u| u.skip_invitation = true }
        UserMailer.invite_user(@consultant).deliver
      end
      flash[:success] = "#{@consultant.full_name} updated."
    else
      flash[:errors] = @consultant.errors.full_messages
    end
    redirect_to  consultants_path
  end

  def destroy
    name = @consultant.full_name
    if @consultant.destroy
      flash[:success] = "#{name} Deleted!"
    else
      flash[:errors ] = @consultant.errors.full_messages
    end
    redirect_back fallback_location: root_path
  end

  def authorized_user
    has_access?("manage_consultants")
  end




  private
  def find_consulant
    @consultant = current_company.consultants.find(params[:id])
  end
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
                                       :last_name ,:resend_invitation,:skill_list,
                                       :email ,
                                       :temp_working_hours, :tag_list,:visa_status,:availability,:relocation,
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
                                               :value,
                                               :_destroy
                                           ],attachments_attributes:
                                           [:id,:file,
                                            :file_name,
                                            :file_size,
                                            :company_id ,
                                            :file_type,
                                            :attachable_type,
                                            :attachable_id,
                                            :_destroy],
                                       company_doc_ids:[]
    )
  end

  def create_consultant_params
    params_hash = consultant_params
    if params.has_key?(:job_application_id)
      @job_application = current_company.received_job_applications.find_by_id(params[:job_application_id])
      if @job_application.is_candidate_applicant?
        candidate = @job_application.user
        params_hash = params_hash.merge!(candidate_id: candidate.id , gender: candidate.gender , photo: candidate.photo  , phone: candidate.phone , dob: candidate.dob )
      end
    end
    params_hash
  end
end
