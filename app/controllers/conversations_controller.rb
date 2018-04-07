class ConversationsController < ApplicationController
  # before_action :authenticate_user!

  layout false, except: :index

  def index
    user_ids = Conversation.where("sender_id = ? OR recipient_id = ?", get_current_user.id, get_current_user.id).pluck(:sender_id, :recipient_id).flatten
    @users = User.where.not(id: get_current_user.id).where(id: user_ids).order("created_at DESC").paginate(:page => params[:page], :per_page => 10)
  end

  def create
    if params[:user_type] == "Candidate"
      user = Candidate.where(id: params[:user_id]).first
    elsif params[:user_type] == "Group"
      user = Group.where(id: params[:user_id]).first
    else
      user = User.where(id: params[:user_id]).first
    end

    set_conversation(user, params[:chat_topic])
    @messages = @conversation.conversation_messages.last(50)

    @unread_message_count = 0 #Conversation.joins(:conversation_messages).where("(senderable_type = ? AND senderable_id = ? ) OR (recipientable_type = ? AND recipientable_id = ?)", get_current_user.class.to_s, get_current_user.id, get_current_user.class.to_s, get_current_user.id).where.not(conversation_messages: {is_read: true, userable: get_current_user}).uniq.count
    render json: { conversation_id: @conversation.id, user_id: get_current_user.id, unread_message_count: @unread_message_count }
  end

  def show
    @conversation = Conversation.find(params[:id])
    # @reciever = interlocutor(@conversation)
    @current_user = get_current_user
    @conversation_messages = @conversation.conversation_messages
    @conversation_message = ConversationMessage.new
  end

  private

  def set_conversation(user, chat_topic)
    if chat_topic == "Group"
      GroupMsgNotify.where(group_id: user.id, member_type: get_current_user.class.to_s, member_id: get_current_user.id).update_all(is_read: true)
      if Conversation.where(chatable: user, topic: "GroupChat").present?
        @conversation = Conversation.where(chatable: user, topic: "GroupChat").first
      else
        @conversation = Conversation.create!({chatable: user, topic: "GroupChat"})
      end
    else
      ConversationMessage.unread_messages(user, get_current_user).update_all(is_read: true)
      if Conversation.between(get_current_user, user).present?
        @conversation = Conversation.between(get_current_user, user).first
      else
        @conversation = Conversation.create!({senderable: get_current_user, recipientable: user})
      end
    end
  end

  def  get_conversation_users
    user_ids = Conversation.where("(senderable_type = ? AND senderable_id = ? AND recipientable_type = 'Candidate') OR (recipientable_type = ? AND recipientable_id = ? AND senderable_type = 'Candidate')", "User", get_current_user.id, "User", get_current_user.id).pluck(:senderable_id, :recipientable_id).flatten
    @candidates = Candidate.where(id: user_ids).order("created_at DESC").paginate(:page => params[:page], :per_page => 10)

    user_ids = Conversation.where("(senderable_type = ? AND senderable_id = ? AND recipientable_type != 'Candidate') OR (recipientable_type = ? AND recipientable_id = ? AND senderable_type != 'Candidate')", "User", get_current_user.id, "User", get_current_user.id).pluck(:senderable_id, :recipientable_id).flatten
    @companies = User.where.not(id: get_current_user.id).where(id: user_ids).order("created_at DESC").paginate(:page => params[:page], :per_page => 10)
  end

  def interlocutor(conversation)
    get_current_user == conversation.recipientable ? conversation.senderable : conversation.recipientable
  end

  def get_current_user
    if current_user.present?
      current_user
    elsif current_candidate.present?
      current_candidate
    end
  end

end