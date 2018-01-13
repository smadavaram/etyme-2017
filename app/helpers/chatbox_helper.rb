module ChatboxHelper


  def set_company_chat_user_data(current_chat_user, user)
    conversation = Conversation.between(current_user, user).first
    message = conversation.conversation_messages.order("created_at DESC").first if conversation.present?

    class_name = ""
    last_msg = ""
    last_msg_time = ""
    unread_count = ""

    if message.present?
      class_name = "unread" unless message.is_read
      unread_count = ConversationMessage.unread_messages(user, current_user).count
      last_msg = message.body[0..50]
      last_msg_time = time_ago_in_words(message.created_at)
    end
    if current_chat_user == user
      class_name = "active"
    end

    {
        class_name: class_name,
        last_msg: last_msg,
        last_msg_time: last_msg_time,
        unread_count: unread_count
    }
  end


  def set_candidate_chat_user_data(current_chat_user, user)
    conversation = Conversation.between(current_candidate, user).first
    message = conversation.conversation_messages.order("created_at DESC").first if conversation.present?

    class_name = ""
    last_msg = ""
    last_msg_time = ""
    unread_count = ""

    if message.present?
      class_name = "unread" unless message.is_read
      unread_count = ConversationMessage.unread_messages(user, current_candidate).count
      last_msg = message.body[0..50]
      last_msg_time = time_ago_in_words(message.created_at)
    end
    if current_chat_user == user
      class_name = "active"
    end

    {
        class_name: class_name,
        last_msg: last_msg,
        last_msg_time: last_msg_time,
        unread_count: unread_count
    }
  end

end
