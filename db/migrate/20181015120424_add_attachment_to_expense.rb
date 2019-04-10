class AddAttachmentToExpense < ActiveRecord::Migration[4.2][5.1]
  def change
    add_column :expenses, :attachment, :string
  end
end
