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

  def get_conversation_title(conversation)
    if conversation.present?
      if conversation.chatable.present?
        if conversation.chatable_type == "Group"
          conversation.chatable.group_name
        else
          ''
        end
      elsif  conversation.senderable == current_user
        conversation.recipientable.full_name
      else
        conversation.senderable.full_name
      end
    else
      ''
    end
  end

end
