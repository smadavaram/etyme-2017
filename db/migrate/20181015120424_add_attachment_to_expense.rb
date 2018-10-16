class AddAttachmentToExpense < ActiveRecord::Migration[5.1]
  def change
    add_column :expenses, :attachment, :string
  end
end
