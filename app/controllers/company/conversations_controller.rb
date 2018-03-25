class Company::ConversationsController < Company::BaseController

  skip_before_action :authenticate_user!, only: :search

  def index
    get_conversation_users
    message = ConversationMessage.joins(:conversation).where("(senderable_type = ? AND senderable_id = ? ) OR (recipientable_type = ? AND recipientable_id = ?)", current_user.class.to_s, current_user.id, current_user.class.to_s, current_user.id).where.not(is_read: true, userable: current_user).order("created_at DESC").first
    if message.present?
      set_conversation(message.userable)
      @current_chat = message.userable
      @messages = @conversation.conversation_messages.last(50)
    elsif @candidates.present?
      set_conversation(@candidates.first)
      @current_chat = @candidates.first
      @messages = @conversation.conversation_messages.last(50)
    end
    @unread_message_count = Conversation.joins(:conversation_messages).where("(senderable_type = ? AND senderable_id = ? ) OR (recipientable_type = ? AND recipientable_id = ?)", current_user.class.to_s, current_user.id, current_user.class.to_s, current_user.id).where.not(conversation_messages: {is_read: true, userable: current_user}).uniq.count
  end

  def create
    if params[:user_type] == "Candidate"
      user = Candidate.where(id: params[:user_id]).first
    else
      user = User.where(id: params[:user_id]).first
    end

    set_conversation(user)
    @messages = @conversation.conversation_messages.last(50)
    @unread_message_count = Conversation.joins(:conversation_messages).where("(senderable_type = ? AND senderable_id = ? ) OR (recipientable_type = ? AND recipientable_id = ?)", current_user.class.to_s, current_user.id, current_user.class.to_s, current_user.id).where.not(conversation_messages: {is_read: true, userable: current_user}).uniq.count
    respond_to do |format|
      format.html {
        get_conversation_users
        render 'index'
      }
      format.js
    end
  end

  def search
    @candidates = Candidate.like_any([:first_name, :last_name], params[:keyword].to_s.split)
    @companies = User.joins(:company).where("companies.name ILIKE ?", "%#{params[:keyword].to_s}%")
  end

  private

  def set_conversation(user)
    ConversationMessage.unread_messages(user, current_user).update_all(is_read: true)
    if Conversation.between(current_user, user).present?
      @conversation = Conversation.between(current_user, user).first
    else
      @conversation = Conversation.create!({senderable: current_user, recipientable: user})
    end
  end

  def  get_conversation_users
    user_ids = Conversation.where("(senderable_type = ? AND senderable_id = ? AND recipientable_type = 'Candidate') OR (recipientable_type = ? AND recipientable_id = ? AND senderable_type = 'Candidate')", "User", current_user.id, "User", current_user.id).pluck(:senderable_id, :recipientable_id).flatten
    @candidates = Candidate.where(id: user_ids).order("created_at DESC").paginate(:page => params[:page], :per_page => 10)

    user_ids = Conversation.where("(senderable_type = ? AND senderable_id = ? AND recipientable_type != 'Candidate') OR (recipientable_type = ? AND recipientable_id = ? AND senderable_type != 'Candidate')", "User", current_user.id, "User", current_user.id).pluck(:senderable_id, :recipientable_id).flatten
    @companies = User.where.not(id: current_user.id).where(id: user_ids).order("created_at DESC").paginate(:page => params[:page], :per_page => 10)
  end

end
