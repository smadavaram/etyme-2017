class Company::JobApplicationsController < Company::BaseController

  #CallBacks
  before_action :find_job , only: [:create,:create_multiple_For_candidate]
  before_action :find_received_job_invitation , only: [:create]
  before_action :set_job_applications , only: [:index]
  before_action :find_received_job_application , only: [:prescreen, :accept , :reject ,:interview,:hire, :short_list,:show ,:proposal, :share_application_with_companies]
  before_action :authorized_user,only: [:accept , :reject ,:interview,:hire, :short_list,:show]
  skip_before_action :authenticate_user! , :authorized_user,only: [:share], raise: false


  add_breadcrumb "JOB APPLICATIONS", :job_applications_path, options: { title: "JOBS APPLICATION" }

  def index
    respond_to do |format|
      format.html {}
      format.json {render json: JobApplicationDatatable.new(params, view_context: view_context)}
    end
  end

  def create
    @job_application  = current_company.sent_job_applications.new(job_application_params.merge!(applicationable_id: current_user.id , job_id: @job.id , job_invitation_id: @job_invitation.id , applicationable_type: 'User'))
    respond_to do |format|
      if @job_application.save
        format.js{ flash.now[:success] = "Successfully Created." }
      else
        format.js{ flash.now[:errors] =  @job_application.errors.full_messages }
      end

    end
  end

  def create_multiple_For_candidate
    if request.post?
      Candidate.where(id: params[:temp_candidates]).each do |c|
        c.job_applications.create!({applicant_resume: c.resume, cover_letter:"Application created by owner",job_id: @job.id })
      end
      @post = true
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
      if !@job_application.hired?
        if @job_application.rejected!
          create_conversation_message
          format.html{ flash[:success] = "Successfully Rejected." }
        else
          format.html{ flash[:errors] =  @job_application.errors.full_messages }
        end
      else
        format.html{ flash[:errors] =  ["Request Not Completed."]}
      end
    end
    redirect_back fallback_location: root_path
  end

  def prescreen
      if @job_application.prescreen!
        create_conversation_message
        flash[:success] = "Successfully Prescreen."
      else
        flash[:errors] =  @job_application.errors.full_messages
      end
    redirect_back fallback_location: root_path
  end

  def short_list
    if @job_application.prescreen?
      if @job_application.short_listed!
        create_conversation_message
         flash[:success] = "Successfully ShortListed."
      else
         flash[:errors] =  @job_application.errors.full_messages
      end
    else
      flash[:errors] =  ["Request Not Completed."]
    end
    redirect_back fallback_location: root_path
  end
  def interview
    respond_to do |format|
      if @job_application.short_listed?
        if @job_application.interviewing!
          create_conversation_message
          format.html{ flash[:success] = "Successfully Interviewed." }
        else
          format.html{ flash[:errors] =  @job_application.errors.full_messages }
        end
      else
        format.html{ flash[:errors] =  ["Request Not Completed."]}
      end

    end
    redirect_back fallback_location: root_path
  end
  def hire
    respond_to do |format|
      if @job_application.interviewing?
        if @job_application.hired!
          create_conversation_message
          format.html{ flash[:success] = "Successfully Hired." }
        else
          format.html{ flash[:errors] =  @job_application.errors.full_messages }
        end
      else
        format.html{ flash[:errors] =  ["Request Not Completed."]}
      end

    end
    redirect_back fallback_location: root_path
  end

  def authorized_user
    has_access?("manage_job_applications")
  end

  def show
    user = @job_application.user
    set_conversation(user)
    # @current_user_conversations = ConversationMessage.where(conversation_id: Conversation.involving(current_user)).last(1)
    @current_user_conversations = Conversation.involving(current_user).last(50)
    @conversation_messages = @conversation.conversation_messages.last(50)
    @unread_message_count = Conversation.joins(:conversation_messages).where("(senderable_type = ? AND senderable_id = ? ) OR (recipientable_type = ? AND recipientable_id = ?)", current_user.class.to_s, current_user.id, current_user.class.to_s, current_user.id).where.not(conversation_messages: {is_read: true, userable: current_user}).uniq.count
    @conversation_message = ConversationMessage.new
  end

  def proposal
    user = @job_application.user
    set_conversation(user)
    @conversation_messages = @conversation.conversation_messages.last(50)
    @unread_message_count = Conversation.joins(:conversation_messages).where("(senderable_type = ? AND senderable_id = ? ) OR (recipientable_type = ? AND recipientable_id = ?)", current_user.class.to_s, current_user.id, current_user.class.to_s, current_user.id).where.not(conversation_messages: {is_read: true, userable: current_user}).uniq.count
    @conversation_message = ConversationMessage.new
  end


  def share
    @job_application = JobApplication.where(share_key: params[:id]).first
    render layout: 'share'
  end

  def share_application_with_companies
    if params.has_key?("vendor_company")
      Company.all.where(id: params[:vendor_company]).each do |c|
        if (c.invited_by.present?)
          next if !c.company_contacts.first.present?
          c.company_contacts.first.notifications.create(message: current_company.name + " share a <a href='http://#{current_company.etyme_url + share_job_application_path(@job_application.share_key)}' target='_blank'>job application - #{@job_application.job.title}</a> with you.",title:"Job Application")
        else
          c.owner.notifications.create(message: current_company.name + " share a <a href='http://#{current_company.etyme_url + share_job_application_path(@job_application.share_key)}' target='_blank'>job application - #{@job_application.job.title}</a> with you.",title:"Job Application")

        end
      end
    end
    redirect_back fallback_location: root_path , notice: "job application - #{@job_application.job.title} Successfully Shared."
  end

  private

  def set_conversation(user)
    ConversationMessage.unread_messages(user, current_user).update_all(is_read: true)
    if Conversation.between(current_user, user).present?
      @conversation = Conversation.between(current_user, user).first
    else
      @conversation = Conversation.create!({senderable: current_user, recipientable: user, chatable: @job_application})
    end
  end


  def set_job_applications
    @search           = current_company.received_job_applications.includes(:job ,:applicationable).search(params[:q])
    @received_job_applications = @search.result.order(created_at: :desc).paginate(page: params[:page], per_page: 10) || []
    @sent_search               = current_company.sent_job_applications.order(created_at: :desc).includes(:job,:applicationable).search(params[:q])
    @sent_job_applications     = @sent_search.result(distinct: true).paginate(page: params[:page], per_page: 10) || []
  end

  def find_job
    # @job = current_company.jobs.find_by_id(params[:job_id]) || []
    @job = Job.where(id: params[:job_id]).first || []
  end

  def find_job_invitation
    @job_invitation = @job.job_invitations.find_by_id(params[:job_invitation_id]) || []
  end

  def find_received_job_invitation
    @job_invitation = current_company.received_job_invitations.where(id: params[:job_invitation_id]).first || []
  end

  def find_received_job_application
    @job_application = current_company.received_job_applications.where(id: params[:id]).first ||  current_company.sent_job_applications.where(id: params[:id]).first  || []
  end

  def job_application_params
    params.require(:job_application).permit([ :message , :cover_letter , :status,:applicant_resume, custom_fields_attributes:
                                                        [
                                                            :id,
                                                            :name,
                                                            :value
                                                        ]])
  end

  def create_conversation_message
    @conversation = @job_application.conversations.find_by(id: params[:conversation_id])
    body = @job_application.applicationable.full_name+" has #{@job_application.status.humanize} <a href='http://#{@job_application.job.created_by.company.etyme_url + job_application_path(@job_application)}'> on your Job </a>#{@job_application.job.title}"
    current_user.conversation_messages.create(conversation_id: @conversation.id, body: body)
  end


end
