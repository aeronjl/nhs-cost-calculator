"use client"

import { useState, useEffect } from 'react'
import { formatMoney, formatTime } from './utils/formatters'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"

const ANNUAL_NHS_SPENDING = 192000000000 // £192 billion
const MINUTES_PER_YEAR = 525600

interface SpendingOption {
  name: string
  cost: number
  emoji: string
  quantity: number
}

const spendingOptions: SpendingOption[] = [
  { name: "Hinkley Point C-style nuclear plant", cost: 32000000000, emoji: "☢️", quantity: 1 },
  { name: "South Korean-style nuclear plant", cost: 5300000000, emoji: "⚡", quantity: 1 },
  { name: "mile of HS2", cost: 396000000, emoji: "🚅", quantity: 10 },
  { name: "km of French-style tram system", cost: 20000000, emoji: "🚊", quantity: 50 },
  { name: "new home", cost: 250000, emoji: "🏠", quantity: 10000 },
  { name: "year of world-class research", cost: 1000000, emoji: "🔬", quantity: 100 },
  { name: "CRISPR gene-editing experiment", cost: 100000, emoji: "🧬", quantity: 1000 },
  { name: "advanced AI training run", cost: 1000000, emoji: "🤖", quantity: 100 }
]

export default function NHSSpendingCalculator() {
  const [amount, setAmount] = useState(ANNUAL_NHS_SPENDING)
  const [inputValue, setInputValue] = useState(ANNUAL_NHS_SPENDING.toString())

  useEffect(() => {
    setInputValue(amount.toLocaleString())
  }, [amount])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^0-9.]/g, '')
    setInputValue(value)
    const numericValue = parseFloat(value)
    if (!isNaN(numericValue)) {
      setAmount(numericValue)
    }
  }

  const handleQuickInput = (cost: number, quantity: number) => {
    const newAmount = cost * quantity
    setAmount(newAmount)
    setInputValue(newAmount.toLocaleString())
  }

  const timeInMinutes = (amount / ANNUAL_NHS_SPENDING) * MINUTES_PER_YEAR
  const formattedTime = formatTime(timeInMinutes)

  return (
    <Card className="max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle className="text-3xl font-light text-center">NHS Spending Time Converter</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-6">
          <label htmlFor="amount" className="block text-sm font-medium text-gray-700 mb-2">
            Enter amount (£):
          </label>
          <Input
            type="text"
            id="amount"
            value={inputValue}
            onChange={handleInputChange}
            className="w-full"
            aria-describedby="amount-description"
          />
          <p id="amount-description" className="mt-2 text-sm text-gray-500">
            Enter an amount or use the quick input buttons below.
          </p>
        </div>
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-2">Quick Input:</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {spendingOptions.map((option, index) => (
              <Button
                key={index}
                onClick={() => handleQuickInput(option.cost, option.quantity)}
                className="text-sm h-auto py-2 px-3 whitespace-normal"
                variant="outline"
              >
                <span className="mr-1">{option.emoji}</span>
                <span className="text-xs">
                  {option.quantity} {option.name}{option.quantity > 1 ? 's' : ''}
                </span>
              </Button>
            ))}
          </div>
        </div>
        <div className="mb-6">
          <h2 className="text-xl font-light mb-2">Equivalent NHS Spending Time:</h2>
          <p className="text-2xl font-semibold" aria-live="polite">{formattedTime}</p>
        </div>
        <div>
          <h2 className="text-xl font-light mb-2">Alternative Progress-Focused Spending Options:</h2>
          <ul className="space-y-3">
            {spendingOptions.map((option, index) => {
              const quantity = Math.floor(amount / option.cost)
              if (quantity < 1) return null
              return (
                <li key={index} className="flex items-center">
                  <span className="text-2xl mr-3" aria-hidden="true">{option.emoji}</span>
                  <span className="text-sm">
                    {formatMoney(amount)} could fund {quantity.toLocaleString()} {option.name}
                    {quantity !== 1 ? 's' : ''}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}

