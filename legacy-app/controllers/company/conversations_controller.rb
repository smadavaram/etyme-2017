# frozen_string_literal: true

class Company::ConversationsController < Company::BaseController
  skip_before_action :authenticate_user!, only: :search
  before_action :find_attachments, :find_signers, only: [:chat_docusign]
  add_breadcrumb 'Dashboard', :dashboard_path
  $the_array = []
  def index
    
    add_breadcrumb 'Inbox'
    respond_to do |format|
      @query = nil
      @topic = nil
      format.html do
        @conversations = Conversation.where(sub_chats: false).all_onversations(current_user).uniq{ |c| c.chatable_id}.uniq{ |c| c.opt_participant(current_user).full_name}.paginate(page: params[:page], per_page: 15)
        # @conversation = Conversation.find(228)
        @conversation = params[:conversation].present? ? Conversation.where(sub_chats: false).find(params[:conversation]) : @conversations.first
        @favourites = current_user.favourables.uniq
        set_activity_for_job_application
      end
      format.js do
        @conversations = Conversation.where(sub_chats: false).all_onversations(current_user).uniq.paginate(page: params[:page], per_page: 10)
      end
    end
    # @unread_message_count = Conversation.joins(:conversation_messages).where("(senderable_type = ? AND senderable_id = ? ) OR (recipientable_type = ? AND recipientable_id = ?)", current_user.class.to_s, current_user.id, current_user.class.to_s, current_user.id).where.not(conversation_messages: {is_read: true, userable: current_user}).uniq.count
  end

  def index_2

    add_breadcrumb 'Inbox'
    respond_to do |format|
      @query = nil
      @topic = nil
      format.html do
        @conversations = Conversation.where(sub_chats: false).all_onversations(current_user).uniq{ |c| c.chatable_id}.uniq{ |c| c.opt_participant(current_user).full_name}.paginate(page: params[:page], per_page: 15)
        # @conversation = Conversation.find(228)
        @conversation = params[:conversation].present? ? Conversation.where(sub_chats: false).find(params[:conversation]) : @conversations.first
        @favourites = current_user.favourables.uniq
        set_activity_for_job_application
      end
      format.js do
        @conversations = Conversation.where(sub_chats: false).all_onversations(current_user).uniq.paginate(page: params[:page], per_page: 10)
      end
    end
    # @unread_message_count = Conversation.joins(:conversation_messages).where("(senderable_type = ? AND senderable_id = ? ) OR (recipientable_type = ? AND recipientable_id = ?)", current_user.class.to_s, current_user.id, current_user.class.to_s, current_user.id).where.not(conversation_messages: {is_read: true, userable: current_user}).uniq.count
  end
  def mini_chat
    service = ConversationManagementService.new(company: current_company, user: current_user)
    result = service.find_or_create_mini_chat(params)
    if result.is_a?(Hash)
      @conversation = result[:conversation]
      @candidate = result[:candidate]
    else
      @conversation = result
    end
  end

  def chat_docusign
    service = ConversationManagementService.new(company: current_company, user: current_user)
    result = service.sign_chat_documents(params[:conversation_id], doc_ids: params[:ids], signers: params[:signers])
    if result[:success]
      flash[:success] = 'Document is submitted to the candidate for signature'
    else
      flash[:errors] = [result[:error]]
    end
    redirect_to company_conversations_path(conversation: params[:conversation_id])
  end

  def create
    @conversation = Conversation.where(id: params[:conversation]).first
    @activities = PublicActivity::Activity.where(recipient: @conversation.job_application).order('created_at desc') if @conversation.job_application.present?
    @favourites = current_user.favourables
    @conversation.conversation_messages.where.not(userable_id: current_user.id).update_all(is_read: true)
    # @unread_message_count = Conversation.joins(:conversation_messages).where("(senderable_type = ? AND senderable_id = ? ) OR (recipientable_type = ? AND recipientable_id = ?)", current_user.class.to_s, current_user.id, current_user.class.to_s, current_user.id).where.not(conversation_messages: {is_read: true, userable: current_user}).uniq.count
    respond_to do |format|
      format.html do
        render 'index'
      end
      format.js
    end
  end

  # def update_company_conversation_title
  #   group_data = Group.find_by(id: params[:group_id])
  #   group_data.update(branchout: params[:branchout])
  #   respond_to do |format|
  #     format.js {render inline: "location.reload();" }
  #   end
  # end

  def update_company_conversation_title
    service = ConversationManagementService.new(company: current_company, user: current_user)
    service.create_branch_conversation(params)
    respond_to do |format|
      format.js {render inline: "location.reload();" }
    end
  end

  def delete_company_conversation_title
    conversation_data = Conversation.find_by(id: params[:conversation_id])
    conversation_data.update(freeze_chats: true)
    # code to remove id from branch out column
    respond_to do |format|
      format.js {render inline: "location.reload();" }
    end
  end  


  def posposal_chats 
  end




  def search 
    @query = params[:keyword]
    @topic = params[:topic].present? ? params[:topic] : 'All'
    @conversations = if @query.present? && @topic.present?
                       @topic == 'All' ?
                        Conversation.where(sub_chats: false).conversation_of(current_company, @query, online_user).paginate(page: params[:page], per_page: 15) :
                        if params[:topic] == "PorposalChat"
                        Conversation.where.not(porposal_chat_id: nil).conversation_of(current_company, @query, online_user).paginate(page: params[:page], per_page: 15)
                        else
                        Conversation.where(sub_chats: false).send(@topic).conversation_of(current_company, @query, online_user).paginate(page: params[:page], per_page: 15)
                        end
                     else
                       @topic == 'All' ?
                        Conversation.where(sub_chats: false).all_onversations(online_user).uniq{ |c| c.chatable_id}.uniq{ |c| c.opt_participant(current_user).full_name}.paginate(page: params[:page], per_page: 15) :
                        if params[:topic] == "PorposalChat"
                        Conversation.where.not(porposal_chat_id: nil).all_onversations(online_user).paginate(page: params[:page], per_page: 15)
                        elsif  @topic == 'GroupChat'
                        conversationss = Conversation.where(sub_chats: false, porposal_chat_id: nil).send(@topic).all_onversations(online_user)
                        conversationss.uniq{|c| c.opt_participant(current_user).full_name}.paginate(page: params[:page], per_page: 15)
                        else
                        Conversation.where(sub_chats: false).send(@topic).all_onversations(online_user).paginate(page: params[:page], per_page: 15)
                        end
                     end
    # group_ids = Group.user_chat_groups(online_user, current_company).ids
    # conversations.uniq{|c| c.opt_participant(current_user).full_name}
    # @conversationsselect { |con| group_ids.include?(con.chatable_id) }
  end

  def add_to_favourite
    @favourite = current_user.favourables.create(favourabled_type: params[:favourabled_type], favourabled_id: params[:favourabled_id])
  end

  def remove_from_favourite
    favourable = current_user.favourables.where(favourabled_type: params[:favourabled_type], favourabled_id: params[:favourabled_id]).first
    @user = favourable.favourabled
    favourable.destroy
  end

  def add_to_chat
    service = ConversationManagementService.new(company: current_company, user: current_user)
    result = service.add_member_to_chat(params)
    if result[:success]
      flash[:success] = result[:message] || 'Member added successfully'
    else
      flash[:error] = result[:error] || result[:errors]&.join(', ')
      if result[:error] == 'Select any one option.'
        redirect_to company_conversations_path(conversation: params[:chatconversation])
        return
      end
    end
    redirect_back(fallback_location: current_company.etyme_url)
  end

  def remove_from_chat
    groupable = Groupable.find(params[:groupable_id])
    if groupable.destroy
      flash[:success] = 'Collaborator is removed'
    else
      flash[:errors] = groupable.errors.full_messages
    end
    redirect_back(fallback_location: current_company.etyme_url)
  end

  def mute
    conversation = Conversation.find(params[:id])
    ConversationMute.create(conversation: conversation, mutable: current_user)
    redirect_to company_conversations_path(conversation: conversation.id)
  end

  def unmute
    conversation = Conversation.find(params[:id])
    ConversationMute.where(conversation: conversation, mutable: current_user).destroy_all
    redirect_to company_conversations_path(conversation: conversation.id)
  end

  def chat_members
    @company_contacts = current_company.company_contacts.pluck(:email, :id, :first_name, :last_name)
                          .map{|cc| {email: cc[0], id: cc[1], name: cc[2].to_s.capitalize + ' ' + cc[3].capitalize}}
    render status: 200, json: {
        message: 'Success!',
        data: @company_contacts
    }
  end
  def chat_candidates
    @candidates = current_company.candidates.pluck(:email, :id, :first_name, :last_name)
                    .map{|cc| {email: cc[0], id: cc[1], name: cc[2].to_s.capitalize + ' ' + cc[3].capitalize}}
    render status: 200, json: {
        message: 'Success!',
        data: @candidates
    }
  end


  private

  def set_activity_for_job_application
    @activities = PublicActivity::Activity.where(recipient: @conversation.job_application).order('created_at desc') if @conversation&.job_application.present?
  end

  def online_user
    current_user.present? ? current_user : current_candidate
  end

  def find_attachments
    @company_candidate_docs = current_company.company_candidate_docs.where(id: params[:ids])
  end

  def find_signers
    @signers = current_company.users.where(id: params[:signers])
  end
end
