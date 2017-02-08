class Company::CandidatesController < Company::BaseController
 # add_breadcrumb "CANDIDATE", :candidate_path, options: { title: "CANDIDATE" }
  before_action :find_candidate , only: [:edit, :update]

 def index
   @search      = current_company.candidates.search(params[:q])
   @candidates = @search.result.order(created_at: :desc).paginate(page: params[:page], per_page: 30) || []
 end

  def new
    @candidate = Candidate.new
    @candidate.educations.build
    @candidate.experiences.build
  end


  def manage_groups
  @manage_candidate = current_company.candidates.find(params[:candidate_id])
    if request.patch?
      @manage_candidate.update_attributes(group_ids:params[:candidate][:group_ids])
      if @manage_candidate.save
        flash[:success] = "Groups has been Updated"
      else
        flash[:errors] = @manage_candidate.errors.full_messages
      end
        redirect_to :back
    end
  end



   def create

      if Candidate.signup.where(email:params[:candidate][:email]).present? && !current_company.candidates.find_by(email:params[:candidate][:email]).present?
       flash[:already_exist] = true
       flash[:email] = params[:candidate][:email]
       redirect_to company_candidates_path
      elsif Candidate.signup.where(email:params[:candidate][:email]).present? && current_company.candidates.find_by(email:params[:candidate][:email]).present?
        flash[:notice] = "Candidate Already Present in Your Network!"
        redirect_to company_candidates_path
      else
       @candidate = current_company.candidates.new(create_candidate_params.merge(send_welcome_email_to_candidate: false,invited_by_id: current_user.id ,invited_by_type: 'User', status:"campany_candidate"))
       if @candidate.save
         current_company.candidates <<  @candidate
         flash[:success] =  "Successfull Added."
         redirect_to candidates_path
       else
         flash[:errors] = @candidate.errors.full_messages
         redirect_to :back
       end
     end
   end


  def edit

  end

  def update
    if @candidate.update(create_candidate_params)
      flash[:success] = "#{@candidate.full_name} updated successfully."
      redirect_to company_candidates_path
    else
      flash[:errors] = @candidate.errors.full_messages
      redirect_to :back
    end

  end

  private

 def find_candidate
   @candidate = current_company.candidates.find(params[:id])
 end

    def create_candidate_params
      params.require(:candidate).permit(:first_name,:invited_by_id ,:invited_by_type,
                                        :resume ,:description, :last_name,:dob,:phone,
                                        :email,
                                        experiences_attributes:[:id,
                                            :experience_title,:end_date,
                                            :start_date,:institute,
                                            :description,:_destroy
                                        ],
                                        educations_attributes:[:id,
                                          :degree_title,:grade,
                                          :completion_year,:start_year,
                                          :institute,:description,:_destroy
                                         ])
    end


end
