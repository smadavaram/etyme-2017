class AddAttachemntFieldsInChat < ActiveRecord::Migration[4.2][5.1]
  def change
    add_column :conversation_messages, :attachment_file, :string
    add_column :conversation_messages, :file_name, :string
    add_column :conversation_messages, :file_size, :string
    add_column :conversation_messages, :file_type, :string
  end
end
