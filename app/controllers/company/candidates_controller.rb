class Company::CandidatesController < Company::BaseController

  def create
    @candidate = current_company.consultants.new(candidate_params)
    if @candidate.valid? && @candidate.save
      flash[:success] =  "Successfull Added."
      redirect_to :back
    else
      flash[:errors] = @candidate.errors.full_messages
    end
  end

  private

  def candidate_params
    params.require(:candidate).permit(:first_name,
                                       :last_name ,
                                       :email ,
                                       role_ids: [],
                                       custom_fields_attributes:
                                           [
                                               :id,
                                               :name,
                                               :value
                                           ],
                                       company_doc_ids:[]
    )
  end

end
