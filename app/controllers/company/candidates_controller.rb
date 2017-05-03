class Company::CandidatesController < Company::BaseController
 # add_breadcrumb "CANDIDATE", :candidate_path, options: { title: "CANDIDATE" }
  before_action :find_candidate , only: [:edit, :update , :add_reminder,:assign_status]
  before_action :find_signup_candidate ,only: [:create_chat]
  add_breadcrumb "Company", :dashboard_path
  add_breadcrumb "Candidates", :company_candidates_path

  before_action :authorized_user ,only:  [:new , :index,:update,:make_hot,:make_normal]

 def index
   @search      = current_company.candidates.search(params[:q])
   @candidates = @search.result.order(created_at: :desc).paginate(page: params[:page], per_page: 30) || []
 end

  def new
    add_breadcrumb "New", "#"
    @candidate = Candidate.new
  end


  def manage_groups
  @manage_candidate = current_company.candidates.find(params[:candidate_id])
    if request.patch?
      groups = params[:candidate][:group_ids]
      groups = groups.reject { |t| t.empty? }
      groups_id = groups.map(&:to_i)
      @manage_candidate.update_attribute(:group_ids, groups_id)
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
         @candidate.create_activity :create, owner:current_company,recipient: current_company
         flash[:success] =  "Successfull Added."
         redirect_to candidates_path
       else
         flash[:errors] = @candidate.errors.full_messages
         redirect_to :back
       end
     end
   end

  def make_hot
    @company_candidate = CandidatesCompany.normal.where(candidate_id: params[:candidate_id],company_id:current_company.id)
      if @company_candidate.update_all(status:1)
        flash[:success] = "Candidate is now Hot Candidate."
        respond_to do |format|
          format.js {render inline: "location.reload();" }
        end
      else
        flash[:errors] =  @company_candidate.errors.full_messages
        respond_to do |format|
          format.js {render inline: "location.reload();" }
        end
      end

  end

  def make_normal
    @company_candidate = CandidatesCompany.hot_candidate.where(candidate_id: params[:candidate_id],company_id:current_company.id)
    if @company_candidate.update_all(status:0)
      flash[:success] = "Candidate is now Normal Candidate."
      respond_to do |format|
        format.js {render inline: "location.reload();" }
      end
    else
      flash[:errors] =  @company_candidate.errors.full_messages
      respond_to do |format|
        format.js {render inline: "location.reload();" }
      end
    end

  end


  def edit
    add_breadcrumb @candidate.full_name, "#"
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


  def authorized_user
    has_access?("manage_consultants")
  end

  # for assigning  of Reminder To Candidates
  def add_reminder

  end

  # for sharing of hot candidates
  def share_candidates
    c_ids = params[:candidates_ids].split(",").map { |s| s.to_i }
    UserMailer.share_hot_candidates(params[:emails].split(","),c_ids,current_company,params[:message]).deliver_now
    flash[:success] = "Candidates shared successfully."
    redirect_to :candidates
  end

  def create_chat
    @chat = current_company.chats.find_or_initialize_by(chatable: @candidate)
    if @chat.new_record?
       @chat.save
       @chat.chat_users.create(userable: current_user)
       @chat.chat_users.create(userable: @candidate)
    else
      @chat.chat_users.find_or_create_by(userable:current_user)
    end
    redirect_to company_chat_path(@chat)
  end

  def assign_status

  end

  private

  def find_signup_candidate
    @candidate = Candidate.find(params[:candidate_id]) || []
  end

 def find_candidate
   @candidate = current_company.candidates.find(params[:id] || params[:candidate_id])
 end

    def create_candidate_params
      params.require(:candidate).permit(:first_name,:invited_by_id ,:send_invitation,:invited_by_type,
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
                                         ],custom_fields_attributes: [
                                              :id,
                                              :name,
                                              :value,
                                              :_destroy],
                                        portfolios_attributes:
                                            [:id,:name,:cover_photo,:description,:_destroy]
          )
    end


end
