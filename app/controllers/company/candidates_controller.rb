class Company::CandidatesController < Company::BaseController
 # add_breadcrumb "CANDIDATE", :candidate_path, options: { title: "CANDIDATE" }

 def index
   @search      = current_company.candidates.search(params[:q])
   @candidates = @search.result.order(created_at: :desc).paginate(page: params[:page], per_page: 30) || []
 end

  def new
    @candidate = Candidate.new
    @candidate.educations.build
    @candidate.experiences.build
  end



 def create
   @candidate = current_company.candidates.new(create_candidate_params.merge(send_welcome_email_to_candidate: false,invited_by_id: current_user.id ,invited_by_type: 'User' ,))
   if @candidate.valid? && @candidate.save
     current_company.candidates <<  @candidate
     flash[:success] =  "Successfull Added."
     redirect_to candidates_path
   else
     flash[:errors] = @candidate.errors.full_messages
     return render 'new'
   end
 end

  private

    def create_candidate_params
      params.require(:candidate).permit(:first_name,:invited_by_id ,:invited_by_type,
                                        :resume ,:description, :last_name,:dob,
                                        :email,
                                        experiences_attributes:[
                                            :experience_title,:end_date,
                                            :start_date,:institute,
                                            :description
                                        ],
                                        educations_attributes:[
                                          :degree_title,:grade,
                                          :completion_year,:start_year,
                                          :institute,:description
                                         ])
    end


end
