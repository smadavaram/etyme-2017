class ConvertOneToOneToGroupToConversations < ActiveRecord::Migration[5.1]
  def change
    Conversation.OneToOne.each do |conversation|
      sender = conversation.senderable
      receiver = conversation.recipientable
      if conversation.senderable_type == "Candidate" || sender.nil? || receiver.nil?
        conversation.destroy
      else
        group = sender.company.groups.create(group_name: "#{sender.full_name} #{receiver.full_name}", member_type: 'Chat')
        group.groupables.create(groupable: sender)
        group.groupables.create(groupable: receiver)
        conversation.update(chatable: group, senderable: nil,recipientable: nil)
      end
    end
  end
end