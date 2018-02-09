class ConversationsController < ApplicationController
  before_action :authenticate_user!

  layout false, except: :index

  def index
    user_ids = Conversation.where("sender_id = ? OR recipient_id = ?", current_user.id, current_user.id).pluck(:sender_id, :recipient_id).flatten
    @users = User.where.not(id: current_user.id).where(id: user_ids).order("created_at DESC").paginate(:page => params[:page], :per_page => 10)
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
    render json: { conversation_id: @conversation.id, user_id: current_user.id, unread_message_count: @unread_message_count }
  end

  def show
    @conversation = Conversation.find(params[:id])
    @reciever = interlocutor(@conversation)
    @conversation_messages = @conversation.conversation_messages
    @conversation_message = ConversationMessage.new
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

  def interlocutor(conversation)
    current_user == conversation.recipientable ? conversation.senderable : conversation.recipientable
  end

end