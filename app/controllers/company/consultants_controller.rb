class Company::ConsultantsController < Company::BaseController

  add_breadcrumb "CONSULTANT", :consultants_path, options: { title: "CONSULTANT" }

  #CallBacks
  before_action :set_new_consultant , only: [:new]

  def new
    add_breadcrumb "NEW", :new_consultant_path
    @roles = current_company.roles || []
  end

  def create
    @consultant = current_company.consultants.new(consultant_params)
    if @consultant.valid?
      @consultant.save
      flash[:success] =  "Successfull Added."
      redirect_to dashboard_path
    else
      flash.now[:errors] = @consultant.errors.full_messages
      return render 'new'
    end
  end

  private

  def set_new_consultant
    @consultant = current_company.consultants.new
    @consultant.build_consultant_profile
  end

  def consultant_params
    params.require(:consultant).permit(:first_name,
                                       :last_name ,
                                       :email ,
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
                                       company_doc_ids: []
    )
  end # End of company_params
end
