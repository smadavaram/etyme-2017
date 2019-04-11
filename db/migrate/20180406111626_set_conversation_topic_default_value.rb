class SetConversationTopicDefaultValue < ActiveRecord::Migration[4.2][5.1]
  def change
    remove_column :conversations, :topic, :string
    add_column :conversations, :topic, :integer, default: 0
    add_reference :conversations, :chatable, polymorphic: true
  end
end
