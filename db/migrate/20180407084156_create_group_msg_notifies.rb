class CreateGroupMsgNotifies < ActiveRecord::Migration[5.1]
  def change
    create_table :group_msg_notifies do |t|
      t.belongs_to :group
      t.belongs_to :conversation_message
      t.references :member, polymorphic: true
      t.boolean :is_read, default: false

      t.timestamps
    end
  end
end
