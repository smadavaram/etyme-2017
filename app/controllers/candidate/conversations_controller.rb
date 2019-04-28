class Candidate::ConversationsController < Candidate::BaseController

  def index
    get_conversation_users
    message = ConversationMessage.joins(:conversation).where("(senderable_type = ? AND senderable_id = ? ) OR (recipientable_type = ? AND recipientable_id = ?)", current_candidate.class.to_s, current_candidate.id, current_candidate.class.to_s, current_candidate.id).where.not(is_read: true, userable: current_candidate).order("created_at DESC").first
    if message.present?
      set_conversation(message.userable)
      @current_chat = message.userable
      # @messages = @conversation.conversation_messages.last(50)
    elsif @companies.present?
      set_conversation(@companies.first)
      @current_chat = @companies.first
      # @messages = @conversation.conversation_messages.last(50)
    end
    @unread_message_count = Conversation.joins(:conversation_messages).where("(senderable_type = ? AND senderable_id = ? ) OR (recipientable_type = ? AND recipientable_id = ?)", current_candidate.class.to_s, current_candidate.id, current_candidate.class.to_s, current_candidate.id).where.not(conversation_messages: {is_read: true, userable: current_candidate}).uniq.count
  end

  def create
    if params[:user_type] == "Candidate"
      user = Candidate.where(id: params[:user_id]).first
    else
      user = User.where(id: params[:user_id]).first
    end

    set_conversation(user)
    # @messages = @conversation.conversation_messages.last(50)
    @unread_message_count = Conversation.joins(:conversation_messages).where("(senderable_type = ? AND senderable_id = ? ) OR (recipientable_type = ? AND recipientable_id = ?)", current_candidate.class.to_s, current_candidate.id, current_candidate.class.to_s, current_candidate.id).where.not(conversation_messages: {is_read: true, userable: current_candidate}).uniq.count
    respond_to do |format|
      format.html {
        get_conversation_users
        render 'index'
      }
      format.js
    end
  end

  def add_to_favourite
    @favourite = current_candidate.favourables.create(favourabled_type: params[:favourabled_type], favourabled_id: params[:favourabled_id])
  end

  def remove_from_favourite
    favourable = current_candidate.favourables.where(favourabled_type: params[:favourabled_type], favourabled_id: params[:favourabled_id]).first
    @user = favourable.favourabled if favourable.present?
    favourable.destroy if favourable.present?
  end

  private

  def set_conversation(user)
    ConversationMessage.unread_messages(user, current_candidate).update_all(is_read: true)
    if Conversation.between(current_candidate, user).present?
      @conversation = Conversation.between(current_candidate, user).first
    else
      @conversation = Conversation.create!({senderable: current_candidate, recipientable: user})
    end
  end

  def get_conversation_users
    user_ids = Conversation.where("(senderable_type = ? AND senderable_id = ? AND recipientable_type = 'Candidate') OR (recipientable_type = ? AND recipientable_id = ? AND senderable_type = 'Candidate')", current_candidate.class.to_s, current_candidate.id, current_candidate.class.to_s, current_candidate.id).pluck(:senderable_id, :recipientable_id).flatten
    @candidates = Candidate.where.not(id: current_candidate.id).where(id: user_ids).order("created_at DESC").paginate(:page => params[:page], :per_page => 10)

    user_ids = Conversation.where("(senderable_type = ? AND senderable_id = ? AND recipientable_type != 'Candidate') OR (recipientable_type = ? AND recipientable_id = ? AND senderable_type != 'Candidate')", current_candidate.class.to_s, current_candidate.id, current_candidate.class.to_s, current_candidate.id).pluck(:senderable_id, :recipientable_id).flatten
    @companies = User.where(id: user_ids).order("created_at DESC").paginate(:page => params[:page], :per_page => 10)

    @favourites = current_candidate.favourables
  end

end
